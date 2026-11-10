import type { AudioQueue } from '@/lib/client/audio-queue';

export class Filler {
  private readonly timer: ReturnType<typeof setTimeout>;
  private stopped = false;
  private readonly abort = new AbortController();
  constructor(
    private readonly queue: AudioQueue,
    play: (queue: AudioQueue, signal: AbortSignal) => Promise<void>,
    delay = 1500,
    onPlay?: () => void,
  ) {
    this.timer = setTimeout(
      () => {
        if (this.stopped) return;
        onPlay?.();
        void play(queue, this.abort.signal).catch(() => undefined);
      },
      Math.max(0, delay),
    );
  }
  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.abort.abort();
    this.queue.stopAll();
  }
}
