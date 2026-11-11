import { describe, expect, it, vi } from 'vitest';
import { GreetingCache } from '@/lib/server/greeting';
import { AudioCache } from '@/lib/server/audio-cache';
import { SessionStore } from '@/lib/server/session-store';
import { cloneSession, replaceSession } from '@/lib/agent/session';
import { wavFixture } from '../voice/fixtures';
import type { TtsProvider } from '@/lib/voice/providers';

describe('language isolation', () => {
  it('creates independent English/Hindi calls and rejects changing a live session language', () => {
    const store = new SessionStore();
    const first = store.create({ lang: 'hi-IN' });
    expect(first.lang).toBe('hi-IN');
    const draft = { ...cloneSession(first), lang: 'en-IN' as const };
    expect(() => {
      replaceSession(first, draft);
    }).toThrow();
    expect(first.lang).toBe('hi-IN');
    expect(store.create().lang).toBe('en-IN');
  });
  it('coalesces within each greeting profile without mixing languages', async () => {
    const synthesize = vi
      .fn<TtsProvider['synthesize']>()
      .mockResolvedValue({ wav: wavFixture({ sampleRate: 24000 }), ms: 1 });
    const greeting = new GreetingCache(
      { synthesize },
      {
        model: 'bulbul:v4-flash',
        speaker: 'shubh_enhi_ads',
        pace: 1,
        sampleRate: 24000,
      },
    );
    const [en, hi, hiAgain] = await Promise.all([
      greeting.get(),
      greeting.get(undefined, 'hi-IN'),
      greeting.get(undefined, 'hi-IN'),
    ]);
    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(en.text).toContain('Hello');
    expect(hi.text).toContain('Namaste');
    expect(hi).toEqual(hiAgain);
    expect(synthesize.mock.calls.map((call) => call[1])).toEqual([
      'en-IN',
      'hi-IN',
    ]);
  });
  it('warms Hindi recovery clips using Hindi text, speaker identity and language', async () => {
    const synthesize = vi
      .fn<TtsProvider['synthesize']>()
      .mockResolvedValue({ wav: wavFixture({ sampleRate: 24000 }), ms: 1 });
    const cache = new AudioCache(
      { synthesize },
      {
        language: 'hi-IN',
        model: 'bulbul:v4-flash',
        speaker: 'shubh_enhi_ads',
        pace: 0.9,
        sampleRate: 24000,
      },
    );
    await cache.warm();
    expect(cache.snapshot().state).toBe('ready');
    expect(synthesize).toHaveBeenCalledTimes(6);
    expect(synthesize.mock.calls.every((call) => call[1] === 'hi-IN')).toBe(
      true,
    );
    expect(synthesize.mock.calls[0]?.[0]).not.toContain('One moment');
  });
});
