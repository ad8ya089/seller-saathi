import { describe, expect, it } from 'vitest';
import { AudioCache } from '@/lib/server/audio-cache';
import { FakeTts } from '@/lib/voice/fakes';
import { wavFixture } from '../voice/fixtures';

describe('cached recovery clips', () => {
  it('coalesces prewarming and synthesizes six clips once with at most two in flight', async () => {
    const tts = new FakeTts(wavFixture({ sampleRate: 24000 }));
    const cache = new AudioCache(tts, {
      model: 'test',
      speaker: 'test',
      language: 'en-IN',
    });
    expect(cache.snapshot().state).toBe('pending');
    await Promise.all([cache.warm(), cache.warm()]);
    await cache.warm();
    expect(tts.calls).toHaveLength(6);
    expect(cache.snapshot().state).toBe('ready');
  });
  it('does no provider work when unconfigured', async () => {
    const tts = new FakeTts(wavFixture({ sampleRate: 24000 }));
    const cache = new AudioCache(
      tts,
      { model: 'test', speaker: 'test', language: 'en-IN' },
      false,
    );
    await cache.warm();
    expect(tts.calls).toHaveLength(0);
    expect(cache.snapshot().state).toBe('unconfigured');
  });
});
