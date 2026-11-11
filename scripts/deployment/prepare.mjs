import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
await mkdir('.tmp/p6', { recursive: true });
const env = parseEnv(await readFile('.env.example', 'utf8'));
Object.assign(env, {
  GEMINI_API_KEY: '',
  SARVAM_API_KEY: '',
  NODE_ENV: 'production',
  DOMAIN: 'example.test',
  TRUSTED_PROXY_TOKEN: 'p6-synthetic-proxy-only',
  INTERNAL_METRICS_TOKEN: 'p6-synthetic-internal-only',
  RATE_LIMIT_TURNS: '2',
});
await writeFile(
  '.tmp/p6/keyless.env',
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n',
);
const root = resolve('.tmp/p6').replaceAll('\\', '/');
await writeFile(
  '.tmp/p6/control.env',
  `APP_ENV_FILE=${root}/keyless.env\nAPP_PORT=3300\nAPP_IMAGE=seller-saathi:p6\nDOMAIN=example.test\nTRUSTED_PROXY_TOKEN=p6-synthetic-proxy-only\n`,
);
const production = await readFile('deploy/aws-ec2/Caddyfile', 'utf8');
const tls =
  /\ttls \{\n\t\tissuer acme \{\n\t\t\tdir https:\/\/acme-v02\.api\.letsencrypt\.org\/directory\n\t\t\}\n\t\}/;
if (!tls.test(production))
  throw Error('TLS override no longer matches production');
await writeFile('.tmp/p6/Caddyfile', production.replace(tls, '\ttls internal'));
await writeFile(
  '.tmp/p6/tls.override.yml',
  `services:\n  caddy:\n    ports: !override ["127.0.0.1:80:80", "127.0.0.1:443:443"]\n    volumes:\n      - ${root}/Caddyfile:/etc/caddy/Caddyfile:ro\n`,
);
console.log(
  'Isolated keyless environment and local-only TLS override prepared.',
);
