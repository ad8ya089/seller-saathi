import { access, copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));

try {
  const vad = dirname(require.resolve('@ricky0123/vad-web'));
  const ort = dirname(require.resolve('onnxruntime-web/wasm'));
  const assets = [
    [vad, 'vad.worklet.bundle.min.js'],
    [vad, 'silero_vad_v6.onnx'],
    [ort, 'ort-wasm-simd-threaded.mjs'],
    [ort, 'ort-wasm-simd-threaded.wasm'],
  ];
  await Promise.all(
    assets.map(async ([directory, filename]) => {
      try {
        await access(join(directory, filename));
      } catch {
        throw new Error(
          `Missing VAD asset: ${filename}. Reinstall the pinned dependencies with npm ci.`,
        );
      }
    }),
  );
  const destination = join(root, 'public', 'vad');
  await mkdir(destination, { recursive: true });
  await Promise.all(
    assets.map(([directory, filename]) =>
      copyFile(join(directory, filename), join(destination, filename)),
    ),
  );
  console.log(
    `Copied ${String(assets.length)} local VAD/ONNX assets to public/vad/.`,
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Unable to copy local VAD assets. Run npm ci.',
  );
  process.exitCode = 1;
}
