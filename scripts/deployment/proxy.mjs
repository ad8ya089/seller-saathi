import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const exec = promisify(execFile);
async function request(path, options = {}) {
  const started = performance.now();
  const arrivals = [];
  return await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port: options.port ?? 443,
        servername: 'example.test',
        rejectUnauthorized: false,
        path,
        method: options.method ?? 'GET',
        headers: { Host: 'example.test', ...options.headers },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          arrivals.push({ atMs: performance.now() - started, bytes: c.length });
          body += c;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
            arrivals,
            totalMs: performance.now() - started,
          }),
        );
      },
    );
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(Error('probe timeout')));
    req.end(options.body);
  });
}
const health = await request('/api/health');
if (health.status !== 200) throw Error('normal health unavailable');
const verbose = [];
for (const path of [
  '/api/health?verbose=1',
  '/api/health?verbose=0&verbose=1',
  '/api/health?%76erbose=1',
])
  verbose.push(
    (
      await request(path, {
        headers: { Authorization: 'Bearer p6-synthetic-internal-only' },
      })
    ).status,
  );
const same = await request('/api/session', {
  method: 'POST',
  headers: {
    Origin: 'https://example.test',
    'Content-Type': 'application/json',
  },
  body: '{"lang":"en-IN","mode":"call"}',
});
const cross = await request('/api/session', {
  method: 'POST',
  headers: {
    Origin: 'https://evil.example',
    'Content-Type': 'application/json',
  },
  body: '{"lang":"en-IN","mode":"call"}',
});
const turns = [];
for (let i = 0; i < 3; i++)
  turns.push(
    await request('/api/turn', {
      method: 'POST',
      headers: {
        Origin: 'https://example.test',
        'Content-Type': 'application/json',
        'X-Internal-Proxy-Token': 'spoof-' + i,
        'X-Real-IP': '203.0.113.' + (20 + i),
      },
      body: JSON.stringify({
        sessionId: randomUUID(),
        turnId: randomUUID(),
        text: 'Synthetic routing check.',
      }),
    }),
  );
const directScript = `const post=async(headers)=>{const r=await fetch('http://127.0.0.1:3000/api/turn',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({sessionId:crypto.randomUUID(),turnId:crypto.randomUUID(),text:'Synthetic admission check.'})});return r.status;};const bad=[];for(let i=0;i<3;i++)bad.push(await post({'x-internal-proxy-token':'wrong','x-real-ip':'198.51.100.'+(30+i)}));const good=[];for(let i=0;i<3;i++)good.push(await post({'x-internal-proxy-token':process.env.TRUSTED_PROXY_TOKEN,'x-real-ip':'198.51.100.10'}));good.push(await post({'x-internal-proxy-token':process.env.TRUSTED_PROXY_TOKEN,'x-real-ip':'198.51.100.11'}));const internal=await fetch('http://127.0.0.1:3000/api/health?verbose=1',{headers:{Authorization:'Bearer '+process.env.INTERNAL_METRICS_TOKEN}});console.log(JSON.stringify({bad,good,internal:internal.status}));`;
const direct = JSON.parse(
  (
    await exec('docker', [
      'exec',
      'seller-saathi-p6-tls-app-1',
      'node',
      '--input-type=module',
      '-e',
      directScript,
    ])
  ).stdout,
);
const assets = [];
for (const asset of [
  'vad.worklet.bundle.min.js',
  'silero_vad_v6.onnx',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
]) {
  const r = await request('/vad/' + asset);
  assets.push({
    path: asset,
    status: r.status,
    mime: r.headers['content-type'],
  });
}
const stream = await request('/api/turn', {
  port: 9443,
  method: 'POST',
  headers: {
    'X-Internal-Proxy-Token': 'forged',
    'X-Real-IP': '203.0.113.77',
    'Accept-Encoding': 'gzip',
    'Content-Type': 'text/plain',
  },
  body: 'p6-stream-probe',
});
const first = JSON.parse(
  stream.body
    .split('\n')
    .find((l) => l.startsWith('data: '))
    .slice(6),
);
const report = {
  health: health.status,
  verbose,
  sameOrigin: same.status,
  sameOriginCode: JSON.parse(same.body).code,
  crossOrigin: cross.status,
  spoofedClients: turns.map((r) => r.status),
  retryAfter: turns[2].headers['retry-after'],
  direct,
  assets,
  headers: health.headers,
  stream: {
    status: stream.status,
    headers: stream.headers,
    arrivals: stream.arrivals,
    totalMs: stream.totalMs,
    first,
  },
  noProxyTokenReflected: !JSON.stringify([health, stream, turns]).includes(
    'p6-synthetic-proxy-only',
  ),
};
await writeFile('.tmp/p6/caddy-http.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (
  verbose.some((x) => x !== 404) ||
  cross.status !== 400 ||
  same.status !== 503 ||
  turns[2].status !== 429 ||
  direct.bad[2] !== 429 ||
  direct.good[2] !== 429 ||
  direct.good[3] === 429 ||
  direct.internal !== 200 ||
  assets.some((a) => a.status !== 200) ||
  !first.proxyVerified ||
  !first.peerOverwritten ||
  !first.compressionDisabled ||
  stream.arrivals.length < 3 ||
  stream.arrivals.at(-1).atMs - stream.arrivals[0].atMs < 1000 ||
  stream.headers['content-encoding'] ||
  stream.headers['x-accel-buffering'] !== 'no' ||
  !report.noProxyTokenReflected
)
  process.exitCode = 1;
