import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { AppError } from '@/lib/errors';
import type { AppConfig } from '@/lib/server/config';

export function secretMatches(
  actual: string | null,
  expected: string | undefined,
): boolean {
  if (!actual || !expected) return false;
  return timingSafeEqual(
    createHash('sha256').update(actual).digest(),
    createHash('sha256').update(expected).digest(),
  );
}
export function assertAccess(request: Request, config: AppConfig): void {
  if (
    config.demoAccessCode &&
    !secretMatches(
      request.headers.get('x-demo-access-code'),
      config.demoAccessCode,
    )
  )
    throw new AppError('ACCESS_DENIED', 'Demo access code required');
}
export function peerKey(request: Request, config: AppConfig): string {
  // Web Request has no authenticated socket address. Unknown peers share a
  // conservative bucket; forwarding is trusted only with a proxy-held secret.
  if (
    secretMatches(
      request.headers.get('x-internal-proxy-token'),
      config.trustedProxyToken,
    )
  ) {
    const ip = request.headers.get('x-real-ip');
    if (ip && isIP(ip)) return ip;
  }
  return 'unverified-peer';
}
