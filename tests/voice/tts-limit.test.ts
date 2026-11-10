import { describe, expect, it, vi } from 'vitest';
import { TtsLimiter } from '@/lib/voice/tts-limit';
import { FakeTts } from '@/lib/voice/fakes';
import { wavFixture } from './fixtures';

describe('shared runtime TTS limit', () => {
  it('shares two slots across greeting/cache/turn work and cancels queued requests before billing', async () => {
    const releases: (() => void)[] = [];
    const inner = new FakeTts(wavFixture({ sampleRate: 24000 }), {
      before: (): Promise<void> =>
        new Promise((resolve) => {
          releases.push(resolve);
        }),
    });
    const tts = new TtsLimiter(inner);
    const first = tts.synthesize('Greeting.', 'en-IN');
    const second = tts.synthesize('Filler.', 'en-IN');
    const abort = new AbortController();
    const third = tts.synthesize('Cancelled.', 'en-IN', abort.signal);
    const rejected = expect(third).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
    });
    await vi.waitFor(() => {
      expect(inner.calls).toHaveLength(2);
    });
    abort.abort();
    await rejected;
    releases[0]?.();
    releases[1]?.();
    await Promise.all([first, second]);
    expect(inner.calls).toHaveLength(2);
    const fourth = tts.synthesize('Next.', 'en-IN');
    await vi.waitFor(() => {
      expect(inner.calls).toHaveLength(3);
    });
    releases[2]?.();
    await fourth;
  });
});
