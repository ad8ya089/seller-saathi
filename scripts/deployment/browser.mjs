import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--no-proxy-server',
    '--host-resolver-rules=MAP example.test 127.0.0.1',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${resolve('tests/fixtures/voice/seller-01.wav')}`,
  ],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true });
await context.grantPermissions(['microphone'], {
  origin: 'https://example.test',
});
const page = await context.newPage();
const requests = [];
const errors = [];
const failedResources = [];
page.on('request', (r) => requests.push(r.url()));
page.on('response', (r) => {
  if (r.status() >= 400)
    failedResources.push({ url: r.url(), status: r.status() });
});
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
try {
  await page.addInitScript(() => {
    window.p6violations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.p6violations.push({
        directive: e.violatedDirective,
        blocked: e.blockedURI,
      }),
    );
  });
  const r = await page.goto('https://example.test/?debug=1');
  await page
    .getByRole('button', { name: 'Call Virtual KAM', exact: true })
    .waitFor();
  await page.addScriptTag({
    content: await readFile('.tmp/p6/microphone-harness.js', 'utf8'),
  });
  const microphone = await page.evaluate(() =>
    window.P6Microphone.verifyMicrophone(),
  );
  const violations = await page.evaluate(() => window.p6violations);
  const actualErrors = errors.filter(
    (e) =>
      !(
        e.includes('Failed to load resource') &&
        failedResources.every((r) => r.url.endsWith('/favicon.ico'))
      ),
  );
  const external = requests.filter(
    (u) =>
      !u.startsWith('https://example.test/') &&
      !u.startsWith('blob:https://example.test/'),
  );
  const result = {
    status: r.status(),
    secureContext: await page.evaluate(() => window.isSecureContext),
    microphone,
    violations,
    external,
    errors: actualErrors,
    failedResources,
    assets: requests.filter((u) => u.includes('/vad/')),
    csp: r.headers()['content-security-policy'],
  };
  await writeFile(
    '.tmp/p6/caddy-browser.json',
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  if (
    r.status() !== 200 ||
    !microphone.frames ||
    !microphone.released ||
    violations.length ||
    external.length ||
    actualErrors.length
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
