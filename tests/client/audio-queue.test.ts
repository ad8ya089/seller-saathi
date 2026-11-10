import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioQueue, nextPlaybackTime } from '@/lib/client/audio-queue';
import type { DecodedClip, PlaybackPort } from '@/lib/client/audio-queue';
import { wavFixture } from '../voice/fixtures';

const audio = wavFixture({ sampleRate: 24000 }).toString('base64');
interface Playing {
  start: number;
  ended: () => void;
  stop: () => void;
}
function playback(): {
  port: PlaybackPort;
  playing: Playing[];
  setNow: (time: number) => void;
} {
  let now = 10;
  const playing: Playing[] = [];
  return {
    playing,
    setNow: (time): void => {
      now = time;
    },
    port: {
      now: (): number => now,
      decode: (): Promise<DecodedClip> =>
        Promise.resolve({
          duration: 1,
          play: (start, ended): { stop: () => void } => {
            const stop = vi.fn<() => void>();
            playing.push({ start, ended, stop });
            return { stop };
          },
        }),
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
});

describe('Web Audio scheduling queue', () => {
  it('schedules consecutive clips at the previous end time without adding a gap', async () => {
    const { port, playing } = playback();
    const queue = new AudioQueue(port);
    await Promise.all([queue.enqueue(audio), queue.enqueue(audio)]);
    expect(playing.map((source) => source.start)).toEqual([10.02, 11.02]);
    expect(nextPlaybackTime(15, 12)).toBe(15.02);
  });
  it('resolves drain only after every active source ends and handles duplicate callbacks', async () => {
    const { port, playing } = playback();
    const queue = new AudioQueue(port);
    await queue.enqueue(audio);
    await queue.enqueue(audio);
    let drained = false;
    const idle = queue.whenIdle().then(() => {
      drained = true;
    });
    playing[0]?.ended();
    await Promise.resolve();
    expect(drained).toBe(false);
    playing[1]?.ended();
    playing[1]?.ended();
    await idle;
    expect(drained).toBe(true);
  });
  it('stops sources and releases waiting callers', async () => {
    const { port, playing } = playback();
    const queue = new AudioQueue(port);
    await queue.enqueue(audio);
    const idle = queue.whenIdle();
    queue.stopAll();
    await idle;
    expect(playing[0]?.stop).toHaveBeenCalledOnce();
    await queue.enqueue(audio);
    expect(playing[1]?.start).toBe(10.02);
  });
  it('cancels stale decodes so stopped audio cannot start after a new call', async () => {
    let release: (clip: DecodedClip) => void = () => undefined;
    const decoded = new Promise<DecodedClip>((resolve) => {
      release = resolve;
    });
    const play = vi.fn<DecodedClip['play']>();
    const queue = new AudioQueue({
      now: (): number => 0,
      decode: (): Promise<DecodedClip> => decoded,
    });
    const pending = queue.enqueue(audio);
    await Promise.resolve();
    queue.stopAll();
    release({ duration: 1, play });
    await pending;
    expect(play).not.toHaveBeenCalled();
  });
  it('fires first-playback callbacks at the scheduled time and cancels them on stop', async () => {
    vi.useFakeTimers();
    const { port } = playback();
    const queue = new AudioQueue(port);
    const started = vi.fn<() => void>();
    await queue.enqueue(audio, started);
    expect(started).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(21);
    expect(started).toHaveBeenCalledOnce();
    await queue.enqueue(audio, started);
    queue.stopAll();
    await vi.runAllTimersAsync();
    expect(started).toHaveBeenCalledOnce();
  });
  it('rejects invalid base64/WAV and converts decoder failures into typed errors', async () => {
    const { port } = playback();
    const queue = new AudioQueue(port);
    await expect(queue.enqueue('bad base64')).rejects.toMatchObject({
      code: 'AUDIO_PLAYBACK',
    });
    await expect(
      new AudioQueue({
        ...port,
        decode: (): Promise<DecodedClip> =>
          Promise.reject(new Error('private-browser-error')),
      }).enqueue(audio),
    ).rejects.toMatchObject({ code: 'AUDIO_PLAYBACK' });
  });
});
