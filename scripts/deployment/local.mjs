import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
const run = promisify(execFile);
const docker = async (args) =>
  (await run('docker', args, { maxBuffer: 2e6 })).stdout.trim();
const base = 'http://127.0.0.1:3300';
const compose = [
  'compose',
  '--env-file',
  '.tmp/p6/control.env',
  '-p',
  'seller-saathi-p6-local',
];
const before = await (await fetch(base + '/api/ledger')).json();
// Stop/remove only this test container, retaining its named ledger volume.
await docker([...compose, 'stop', 'app']);
await docker([...compose, 'rm', '-f', 'app']);
const coldStart = performance.now();
await docker([...compose, 'up', '-d', '--no-build', 'app']);
let coldReady = false;
for (let i = 0; i < 150; i++) {
  try {
    if ((await fetch(base + '/api/health')).ok) {
      coldReady = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
const freshContainerToHttpMs = performance.now() - coldStart;
if (!coldReady) throw Error('Fresh container did not become ready');
await docker([
  ...compose,
  'up',
  '-d',
  '--no-build',
  '--wait',
  '--wait-timeout',
  '60',
  'app',
]);
const health = await (await fetch(base + '/api/health')).json();
const page = await fetch(base + '/');
const html = await page.text();
const assets = [];
for (const path of [
  'vad.worklet.bundle.min.js',
  'silero_vad_v6.onnx',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
]) {
  const r = await fetch(base + '/vad/' + path);
  const body = new Uint8Array(await r.arrayBuffer());
  assets.push({
    path,
    status: r.status,
    mime: r.headers.get('content-type'),
    bytes: body.length,
  });
  if (!r.ok || body.length === 0) throw Error('asset failed');
}
const ledger = await (await fetch(base + '/api/ledger')).json();
if (
  !Array.isArray(ledger) ||
  !ledger.some((r) => r.plan.id.startsWith('p6-persistence-'))
)
  throw Error('Seed a guarded synthetic plan before persistence validation');
const id = 'seller-saathi-p6-local-app-1';
const permission = await docker([
  'exec',
  id,
  'node',
  '-e',
  "const f=require('fs');f.writeFileSync('/data/.p6-write-check','ok',{mode:384});const s=f.statSync('/data');console.log(JSON.stringify({uid:process.getuid(),owner:s.uid,mode:(s.mode&511).toString(8)}));f.unlinkSync('/data/.p6-write-check');",
]);
const inspect = JSON.parse(await docker(['inspect', id]))[0];
const stats = JSON.parse(
  await docker(['stats', '--no-stream', '--format', '{{json .}}', id]),
);
const result = {
  health,
  page: page.status,
  htmlHasBrand: html.includes('SellerSaathi'),
  assets,
  ledger,
  freshContainerToHttpMs,
  recreatedLedgerUnchanged: JSON.stringify(before) === JSON.stringify(ledger),
  permission: JSON.parse(permission),
  healthStatus: inspect.State.Health.Status,
  sampledHealthyProbeMs:
    Date.parse(inspect.State.Health.Log.find((e) => e.ExitCode === 0).Start) -
    Date.parse(inspect.State.StartedAt),
  memory: stats.MemUsage,
  imageSizeBytes: Number(
    await docker([
      'image',
      'inspect',
      'seller-saathi:local',
      '--format',
      '{{.Size}}',
    ]),
  ),
};
await writeFile('.tmp/p6/local-check.json', JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    ...result,
    ledger: Array.isArray(ledger) ? ledger.length : 'schema-object',
  }),
);
const start = performance.now();
await docker([
  'compose',
  '--env-file',
  '.tmp/p6/control.env',
  '-p',
  'seller-saathi-p6-local',
  'restart',
  'app',
]);
let ready = false;
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(base + '/api/health')).ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
const after = await (await fetch(base + '/api/ledger')).json();
const restart = {
  restartToHttpMs: performance.now() - start,
  ready,
  ledgerUnchanged: JSON.stringify(after) === JSON.stringify(ledger),
};
await writeFile('.tmp/p6/restart-check.json', JSON.stringify(restart, null, 2));
console.log(JSON.stringify(restart));
if (!ready || !restart.ledgerUnchanged || !result.recreatedLedgerUnchanged)
  process.exitCode = 1;
