import { build } from 'esbuild';
await build({
  entryPoints: ['tests/deployment/ledger-harness.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  conditions: ['react-server'],
  outfile: '.tmp/p6/ledger-harness.mjs',
});
await build({
  entryPoints: ['tests/deployment/microphone-harness.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'P6Microphone',
  target: 'es2022',
  outfile: '.tmp/p6/microphone-harness.js',
});
console.log('Isolated deployment harness bundles created.');
