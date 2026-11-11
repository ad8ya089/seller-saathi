// Local-only keyless image/browser verification. Never activates server fakes.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
const profile = process.argv[3] ?? 'cloud-run';
if (!['cloud-run', 'northflank'].includes(profile))
  throw Error('Unknown local profile');
const northflank = profile === 'northflank';
const name = northflank
  ? 'seller-saathi-northflank-preflight'
  : 'seller-saathi-cloudrun-p76';
const imageTag = northflank
  ? 'seller-saathi:northflank'
  : 'seller-saathi:cloudrun';
const resultDir = northflank ? '.tmp/northflank' : '.tmp/cloud-run';
const port = process.argv[2] ?? '8080';
if (!['8080', '8082'].includes(port))
  throw Error('Use local host port 8080 or 8082');
const url = `http://localhost:${port}`;
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim();
let created = false;
let browser;
try {
  const started = performance.now();
  docker(
    'create',
    '--name',
    name,
    '--memory',
    '1g',
    '--cpus',
    northflank ? '0.5' : '1',
    '-p',
    `127.0.0.1:${port}:8080`,
    '-e',
    'PORT=8080',
    '-e',
    'HOSTNAME=0.0.0.0',
    '-e',
    northflank ? 'PROXY_MODE=caddy' : 'PROXY_MODE=cloud-run',
    '-e',
    northflank ? 'DOMAIN=http--seller-saathi--synthetic.code.run' : 'DOMAIN=',
    '-e',
    'DAILY_TURN_CAP=50',
    '-e',
    'GEMINI_API_KEY=',
    '-e',
    'SARVAM_API_KEY=',
    imageTag,
  );
  created = true;
  docker('start', name);
  let health;
  while (performance.now() - started < 60000) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) {
        health = await r.json();
        break;
      }
    } catch {
      /* startup */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!health?.ok || health.providers.gemini || health.providers.sarvam)
    throw Error('Keyless health failed');
  const bootToHttpMs = performance.now() - started;
  const status = () => {
    const text = docker('exec', name, 'cat', '/proc/1/status');
    return Object.fromEntries(
      ['VmRSS', 'VmHWM'].map((key) => [
        key,
        Number(new RegExp(`${key}:\\s+(\\d+)`).exec(text)?.[1]),
      ]),
    );
  };
  const idle = status();
  const assets = [];
  for (const [file, mime] of [
    ['silero_vad_v6.onnx', 'application/octet-stream'],
    ['ort-wasm-simd-threaded.wasm', 'application/wasm'],
    ['ort-wasm-simd-threaded.mjs', 'javascript'],
    ['vad.worklet.bundle.min.js', 'javascript'],
  ]) {
    const r = await fetch(`${url}/vad/${file}`);
    const type = r.headers.get('content-type');
    if (!r.ok || !type?.includes(mime))
      throw Error('Asset MIME verification failed');
    await r.arrayBuffer();
    assets.push({ file, status: r.status, type });
  }
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${resolve('tests/fixtures/voice/seller-01.wav')}`,
    ],
  });
  const page = await browser.newPage();
  const errors = [],
    violations = [],
    external = [];
  const failedResources = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failedResources.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${m.text()} at ${m.location().url}`);
  });
  page.on('request', (r) => {
    if (!r.url().startsWith(url) && !r.url().startsWith(`blob:${url}`))
      external.push(r.url());
  });
  await page.exposeFunction('recordViolation', (directive) =>
    violations.push(directive),
  );
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) =>
      window.recordViolation(e.violatedDirective),
    ),
  );
  const response = await page.goto(url);
  await page
    .getByRole('button', { name: 'Call Virtual KAM', exact: true })
    .waitFor();
  await page.addScriptTag({
    content: await readFile('.tmp/p6/microphone-harness.js', 'utf8'),
  });
  const microphone = await page.evaluate(() =>
    window.P6Microphone.verifyMicrophone(),
  );
  const actualErrors = errors.filter(
    (e) =>
      !(
        e.includes('Failed to load resource') &&
        e.includes('404') &&
        e.endsWith('/favicon.ico')
      ),
  );
  if (
    !microphone.frames ||
    !microphone.released ||
    violations.length ||
    actualErrors.length ||
    external.length
  )
    throw Error(
      JSON.stringify({
        microphone,
        violations,
        errors: actualErrors,
        external,
        failedResources,
      }),
    );
  const headers = response.headers();
  for (const key of [
    'content-security-policy',
    'permissions-policy',
    'strict-transport-security',
    'x-content-type-options',
    'referrer-policy',
  ]) {
    if (!headers[key]) throw Error('Security header missing');
  }
  const result = {
    image: docker(
      'image',
      'inspect',
      imageTag,
      '--format',
      '{{.Architecture}} {{.Size}}',
    ),
    bootToHttpMs,
    profile,
    idleRssKiB: idle.VmRSS,
    observedServerHighWaterKiB: status().VmHWM,
    callPeakRss: 'not measured; no real provider call',
    health,
    assets,
    microphone,
    violations,
    errors: actualErrors,
    failedResources,
    external,
  };
  await mkdir(resultDir, { recursive: true });
  await writeFile(
    `${resultDir}/local-result.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  if (created) docker('rm', '-f', name); // only the container this invocation created
}
