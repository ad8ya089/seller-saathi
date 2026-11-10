import { access, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const standalone = join(root, '.next', 'standalone');

async function copyIfPresent(relativePath) {
  const source = join(root, relativePath);
  try {
    await access(source);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return;
    throw error;
  }
  await cp(source, join(standalone, relativePath), { recursive: true });
}

try {
  await access(join(standalone, 'server.js'));
  await Promise.all(['.next/static', 'public', 'data'].map(copyIfPresent));
  await import(pathToFileURL(join(standalone, 'server.js')).href);
} catch {
  console.error(
    'Unable to start the standalone app. Run npm run build first and check file permissions.',
  );
  process.exitCode = 1;
}
