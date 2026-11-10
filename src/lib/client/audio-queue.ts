import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { VOICE_LIMITS } from '@/lib/voice/limits';
import { validateWav } from '@/lib/voice/wav';

export interface ActiveClip {
  stop: () => void;
}
export interface DecodedClip {
  duration: number;
  play: (when: number, onEnded: () => void) => ActiveClip;
}
export interface PlaybackPort {
  now: () => number;
  decode: (wav: ArrayBuffer) => Promise<DecodedClip>;
}

export function nextPlaybackTime(now: number, previousEnd: number): number {
  return Math.max(now + 0.02, previousEnd);
}

export class AudioQueue {
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;
  private nextTime = 0;
  private pending = 0;
  private readonly sources = new Set<ActiveClip>();
  private readonly waiters = new Set<() => void>();
  private readonly startTimers = new Set<ReturnType<typeof setTimeout>>();
  constructor(private readonly port: PlaybackPort) {}

  enqueue(base64: string, onStarted?: () => void): Promise<void> {
    const generation = this.generation;
    this.pending += 1;
    const task = this.tail.then(async (): Promise<void> => {
      try {
        if (generation !== this.generation) return;
        if (
          !z
            .base64()
            .min(1)
            .max(Math.ceil(VOICE_LIMITS.ttsAudioBytes / 3) * 4)
            .safeParse(base64).success
        )
          throw new Error('Invalid audio encoding');
        const bytes = Uint8Array.from(atob(base64), (character) =>
          character.charCodeAt(0),
        );
        validateWav(bytes, {
          sampleRates: [VOICE_LIMITS.outputSampleRate],
          maxBytes: VOICE_LIMITS.ttsAudioBytes,
          maxDurationMs: 120000,
        });
        const clip = await this.port.decode(bytes.buffer);
        if (generation !== this.generation) return;
        if (!Number.isFinite(clip.duration) || clip.duration <= 0)
          throw new Error('Empty decoded audio');
        const when = nextPlaybackTime(this.port.now(), this.nextTime);
        this.nextTime = when + clip.duration;
        const holder: { source?: ActiveClip; ended: boolean } = {
          ended: false,
        };
        const finish = (): void => {
          if (holder.ended) return;
          holder.ended = true;
          if (generation !== this.generation) return;
          if (holder.source) this.sources.delete(holder.source);
          this.resolveIdle();
        };
        const source = clip.play(when, finish);
        holder.source = source;
        if (!holder.ended) this.sources.add(source);
        if (onStarted) {
          const timer = setTimeout(
            () => {
              this.startTimers.delete(timer);
              if (generation === this.generation) onStarted();
            },
            Math.max(0, (when - this.port.now()) * 1000),
          );
          this.startTimers.add(timer);
        }
      } catch {
        throw new AppError(
          'AUDIO_PLAYBACK',
          'Audio could not play. Use text input or restart the call.',
          true,
        );
      } finally {
        if (generation === this.generation) {
          this.pending -= 1;
          this.resolveIdle();
        }
      }
    });
    this.tail = task.catch(() => undefined);
    return task;
  }

  whenIdle(): Promise<void> {
    if (this.pending === 0 && this.sources.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.waiters.add(resolve);
    });
  }

  stopAll(): void {
    this.generation += 1;
    this.pending = 0;
    this.nextTime = 0;
    this.tail = Promise.resolve();
    for (const timer of this.startTimers) clearTimeout(timer);
    this.startTimers.clear();
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* A source can end just before stopAll. */
      }
    }
    this.sources.clear();
    this.resolveIdle();
  }

  private resolveIdle(): void {
    if (this.pending !== 0 || this.sources.size !== 0) return;
    for (const resolve of this.waiters) resolve();
    this.waiters.clear();
  }
}
