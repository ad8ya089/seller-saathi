import { describe, expect, it } from 'vitest';
import { SessionStore } from '@/lib/server/session-store';

describe('in-memory sessions', () => {
  it('cancels active session work when End Call removes the session', () => {
    const store = new SessionStore();
    const session = store.create();
    const signal = store.signal(session.id);
    expect(signal.aborted).toBe(false);
    store.remove(session.id);
    expect(signal.aborted).toBe(true);
    expect(store.count()).toBe(0);
  });
  it('expires sessions, prunes health counts and applies active-time/turn caps', () => {
    let now = 0;
    const store = new SessionStore(
      { ttlMs: 100, maxTurns: 2, maxMs: 50 },
      () => now,
    );
    const session = store.create();
    session.turn = 2;
    expect(() => {
      store.assertCanTurn(session);
    }).toThrow('limit');
    session.turn = 0;
    now = 50;
    expect(() => {
      store.assertCanTurn(session);
    }).toThrow('limit');
    now = 100;
    expect(() => store.get(session.id)).toThrow('expired');
    expect(store.count()).toBe(0);
  });
  it('rejects concurrent mutation of the same session and allows independent sessions', async () => {
    const store = new SessionStore();
    const first = store.create();
    const second = store.create();
    let release: () => void = () => undefined;
    const running = store.exclusive(
      first.id,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await expect(
      store.exclusive(first.id, () => Promise.resolve()),
    ).rejects.toMatchObject({ code: 'SESSION_BUSY' });
    await store.exclusive(second.id, () => Promise.resolve());
    release();
    await running;
    await store.exclusive(first.id, () => Promise.resolve());
  });
});
