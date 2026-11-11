import 'server-only';
import { z } from 'zod';
import { AppError } from '@/lib/errors';

const hostSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9.:[\]-]+$/);

export function assertSameOrigin(
  request: Request,
  deployment?: {
    domain?: string | undefined;
    proxyMode?: 'caddy' | 'cloud-run';
  },
): void {
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site')
    throw new AppError('INVALID_INPUT', 'Cross-site requests are not allowed');
  const origin = request.headers.get('Origin');
  if (origin === null) return;
  try {
    const internal = new URL(request.url);
    const host = request.headers.get('Host');
    // Next standalone may normalize request.url to localhost. Host is the
    // browser's actual authority; forwarded-host headers are not trusted here.
    const expected =
      host === null
        ? internal.origin
        : new URL(`${internal.protocol}//${hostSchema.parse(host)}`).origin;
    if (origin === expected) return;
    if (
      deployment?.proxyMode === 'cloud-run' &&
      host &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(host) &&
      origin === `https://${host}`
    )
      return;
    if (
      deployment?.domain &&
      host === deployment.domain &&
      origin === `https://${deployment.domain}`
    )
      return;
  } catch {
    // Invalid authorities and opaque origins fail closed.
  }
  throw new AppError('INVALID_INPUT', 'Cross-origin requests are not allowed');
}
