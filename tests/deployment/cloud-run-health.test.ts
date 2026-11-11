import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it.each(['3000', '8080'])(
  'health probe follows PORT=%s without any real network',
  (port) => {
    const code = `process.env.PORT = '${port}'; globalThis.fetch = async (url) => { if (url !== 'http://127.0.0.1:${port}/api/health') throw Error('Wrong port'); return { ok: true, json: async () => ({ ok: true }) }; }; await import('./scripts/healthcheck.mjs');`;
    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', code], {
        stdio: 'pipe',
      }),
    ).not.toThrow();
  },
);
