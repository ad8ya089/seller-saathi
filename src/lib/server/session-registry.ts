import 'server-only';
import type { AppConfig } from '@/lib/server/config';
import { SessionStore } from '@/lib/server/session-store';

const shared = globalThis as typeof globalThis & {
  sellerSaathiSessions?: SessionStore;
};
export function getSessionStore(config: AppConfig): SessionStore {
  shared.sellerSaathiSessions ??= new SessionStore({
    ttlMs: config.sessionTtlMs,
    maxTurns: config.sessionMaxTurns,
    maxMs: config.sessionMaxMs,
  });
  return shared.sellerSaathiSessions;
}
export function currentSessionCount(): number {
  return shared.sellerSaathiSessions?.count() ?? 0;
}
