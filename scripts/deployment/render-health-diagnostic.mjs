// Keyless local health investigation. No provisioning, other containers or secrets.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { z } from 'zod';

const execute = promisify(execFile);
const label = process.argv[2] ?? 'baseline';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid diagnostic label');
const directory = '.tmp/render-health';
await mkdir(directory, { recursive: true });
const clock = () => ({
  utc: new Date().toISOString(),
  mono: performance.now(),
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence = {
  label,
  imageTag: 'seller-saathi:render',
  clockStart: clock(),
  requests: [],
  logs: [],
  healthProbes: [],
  manual: [],
  samples: [],
};
const docker = async (...args) => {
  const begin = clock();
  try {
    const result = await execute('docker', args, {
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { stdout: result.stdout.trim(), exitCode: 0, begin, end: clock() };
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('stdout' in error))
      throw error;
    return {
      stdout: String(error.stdout).trim(),
      exitCode: error.code,
      begin,
      end: clock(),
    };
  }
};
const required = async (...args) => {
  const result = await docker(...args);
  if (result.exitCode !== 0) throw Error(`Local Docker ${args[0]} failed`);
  return result;
};
const healthSchema = z.object({
  ok: z.literal(true),
  providers: z.object({ gemini: z.literal(false), sarvam: z.literal(false) }),
});
const request = (phase) =>
  new Promise((resolve) => {
    const begin = clock();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      const row = { phase, begin, end: clock(), ...result };
      row.ms = row.end.mono - begin.mono;
      evidence.requests.push(row);
      resolve(row);
    };
    const req = get(
      'http://127.0.0.1:8082/api/health',
      {
        agent: false,
        headers: { Host: 'seller-saathi-synthetic.onrender.com' },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (part) => {
          body += part;
          if (body.length > 8192)
            req.destroy(Error('Oversize health response'));
        });
        response.on('end', () => {
          let valid = false;
          try {
            valid = healthSchema.safeParse(JSON.parse(body)).success;
          } catch {
            /* invalid */
          }
          done({ status: response.statusCode, valid });
        });
        response.on('error', () => done({ error: 'response-error' }));
      },
    );
    const deadline = setTimeout(() => {
      req.destroy();
      done({ error: 'timeout-5000ms' });
    }, 5000);
    req.on('error', (error) => done({ error: error.code ?? 'request-error' }));
  });
const summary = (rows) => {
  const values = rows
    .filter((r) => r.status === 200 && r.valid)
    .map((r) => r.ms)
    .sort((a, b) => a - b);
  return {
    count: rows.length,
    passed: values.length,
    min: values[0],
    median: values.length
      ? (values[Math.floor((values.length - 1) / 2)] +
          values[Math.floor(values.length / 2)]) /
        2
      : null,
    p95: values[Math.ceil(values.length * 0.95) - 1],
    max: values.at(-1),
  };
};
let containerId;
let logProcess;
let collecting = false;
let collector;
const seen = new Set();
const inspect = async () => {
  const result = await required(
    'inspect',
    '--format',
    '{"created":{{json .Created}},"started":{{json .State.StartedAt}},"status":{{json .State.Status}},"oom":{{.State.OOMKilled}},"restarts":{{.RestartCount}},"memory":{{.HostConfig.Memory}},"nanoCpus":{{.HostConfig.NanoCpus}},"health":{{json .State.Health}}}',
    containerId,
  );
  const state = JSON.parse(result.stdout);
  for (const probe of state.health.Log ?? []) {
    if (seen.has(probe.Start)) continue;
    seen.add(probe.Start);
    evidence.healthProbes.push({
      ...probe,
      ms: Date.parse(probe.End) - Date.parse(probe.Start),
    });
  }
  return state;
};
const sample = async (phase) => {
  const result = await required(
    'exec',
    containerId,
    'cat',
    '/proc/1/status',
    '/sys/fs/cgroup/cpu.stat',
    '/sys/fs/cgroup/memory.events',
    '/sys/fs/cgroup/memory.current',
    '/sys/fs/cgroup/memory.peak',
    '/sys/fs/cgroup/cpu.max',
    '/sys/fs/cgroup/memory.max',
  );
  evidence.samples.push({ phase, at: clock(), raw: result.stdout });
};
try {
  evidence.image = JSON.parse(
    (
      await required(
        'image',
        'inspect',
        evidence.imageTag,
        '--format',
        '{"id":{{json .Id}},"architecture":{{json .Architecture}},"bytes":{{.Size}},"healthcheck":{{json .Config.Healthcheck}}}',
      )
    ).stdout,
  );
  const created = await required(
    'create',
    '--name',
    `seller-saathi-health-${label}-${Date.now()}`,
    '--memory=512m',
    '--cpus=0.1',
    '-p',
    '127.0.0.1:8082:10000',
    '-e',
    'PORT=10000',
    '-e',
    'HOSTNAME=0.0.0.0',
    '-e',
    'PROXY_MODE=caddy',
    '-e',
    'DOMAIN=seller-saathi-synthetic.onrender.com',
    '-e',
    'NODE_OPTIONS=--max-old-space-size=384',
    '-e',
    'DAILY_TURN_CAP=50',
    '-e',
    'GEMINI_API_KEY=',
    '-e',
    'SARVAM_API_KEY=',
    evidence.imageTag,
  );
  containerId = created.stdout;
  evidence.containerId = containerId;
  evidence.create = { begin: created.begin, end: created.end };
  const started = await required('start', containerId);
  evidence.start = { begin: started.begin, end: started.end };
  console.log(`${label}: created ${containerId}`);
  logProcess = spawn(
    'docker',
    ['logs', '--follow', '--timestamps', containerId],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let logBuffer = '';
  const recordLogs = (chunk) => {
    logBuffer += chunk.toString();
    const lines = logBuffer.split('\n');
    logBuffer = lines.pop() ?? '';
    for (const line of lines) {
      evidence.logs.push({ received: clock(), line });
      if (line.includes('Network:') && !evidence.listeningLog) {
        evidence.listeningLog = { received: clock(), line };
        console.log(`${label}: observed Next listening callback`);
      }
    }
  };
  logProcess.stdout.on('data', recordLogs);
  logProcess.stderr.on('data', recordLogs);
  collecting = true;
  collector = (async () => {
    while (collecting) {
      try {
        await inspect();
      } catch {
        evidence.collectorError = true;
      }
      await wait(2000);
    }
  })();
  const deadline = started.end.mono + 900000;
  while (performance.now() < deadline) {
    const row = await request('startup');
    if (row.status === 200 && row.valid) {
      evidence.first200 = row;
      break;
    }
    await wait(2000);
  }
  if (!evidence.first200)
    throw Error('No keyless health within 15-minute local window');
  console.log(
    `${label}: first 200 after ${Math.round(evidence.first200.end.mono - started.begin.mono)} ms`,
  );
  await sample('first-200');
  for (let i = 0; i < 50; i += 1) {
    await request('steady');
    await wait(1000);
  }
  evidence.steady = summary(
    evidence.requests.filter((r) => r.phase === 'steady'),
  );
  console.log(`${label}: steady ${JSON.stringify(evidence.steady)}`);
  if (evidence.steady.passed !== 50) throw Error('Steady HTTP health failed');
  await sample('steady');
  await required(
    'cp',
    'tests/deployment/health-probe-trace.mjs',
    `${containerId}:/tmp/health-probe-trace.mjs`,
  );
  for (const mode of ['node-only', 'probe', 'probe', 'probe']) {
    const result = await docker(
      'exec',
      containerId,
      'node',
      '/tmp/health-probe-trace.mjs',
      mode,
    );
    evidence.manual.push({ mode, ...result });
    console.log(
      `${label}: manual ${mode} ${result.exitCode} ${Math.round(result.end.mono - result.begin.mono)} ms`,
    );
  }
  for (let i = 0; i < 20; i += 1) {
    await request('post-probe');
    await wait(1000);
  }
  evidence.postProbe = summary(
    evidence.requests.filter((r) => r.phase === 'post-probe'),
  );
  if (evidence.postProbe.passed !== 20)
    throw Error('Post-probe HTTP health failed');
  await sample('final');
  evidence.finalState = await inspect();
  if (
    evidence.finalState.memory !== 536870912 ||
    evidence.finalState.nanoCpus !== 100000000 ||
    evidence.finalState.oom ||
    evidence.finalState.restarts !== 0 ||
    evidence.finalState.status !== 'running'
  )
    throw Error('Constrained resource/state verification failed');
} catch (error) {
  evidence.failure =
    error instanceof Error ? error.message : 'diagnostic failed';
  process.exitCode = 1;
} finally {
  collecting = false;
  await collector;
  logProcess?.kill();
  if (containerId) {
    evidence.finalState = await inspect();
    await required('rm', '-f', containerId);
    evidence.removed = true;
  }
  evidence.end = clock();
  await writeFile(
    `${directory}/${label}.json`,
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    `${label}: evidence saved; owned container removed=${evidence.removed ?? false}`,
  );
}
