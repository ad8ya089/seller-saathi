import { describe, expect, it, vi } from 'vitest';
import { Filler } from '@/lib/client/filler';
import type { DecodedClip } from '@/lib/client/audio-queue';
import { AudioQueue } from '@/lib/client/audio-queue';

describe('one filler per response', () => {
  it('plays once after 1500ms and cancels when actual audio starts', async () => {
    vi.useFakeTimers();
    try {
      const queue = new AudioQueue({
        now: (): number => 0,
        decode: (): Promise<DecodedClip> => Promise.reject(new Error('unused')),
      });
      const stop = vi.spyOn(queue, 'stopAll');
      const play = vi
        .fn<ConstructorParameters<typeof Filler>[1]>()
        .mockResolvedValue(undefined);
      const filler = new Filler(queue, play);
      await vi.advanceTimersByTimeAsync(1499);
      expect(play).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10000);
      expect(play).toHaveBeenCalledOnce();
      filler.stop();
      expect(stop).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
  it('suppresses filler when actual audio arrives early', async () => {
    vi.useFakeTimers();
    try {
      const queue = new AudioQueue({
        now: (): number => 0,
        decode: (): Promise<DecodedClip> => Promise.reject(new Error('unused')),
      });
      const play = vi
        .fn<ConstructorParameters<typeof Filler>[1]>()
        .mockResolvedValue(undefined);
      const filler = new Filler(queue, play);
      filler.stop();
      await vi.advanceTimersByTimeAsync(10000);
      expect(play).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
