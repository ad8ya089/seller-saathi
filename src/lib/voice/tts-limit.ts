import { AppError } from '@/lib/errors';
import { throwIfAborted } from '@/lib/voice/abort';
import type { TtsProvider, TtsResult } from '@/lib/voice/providers';

interface Waiting {
  resolve: () => void;
  reject: (error: AppError) => void;
  signal?: AbortSignal;
  abort: () => void;
}
export class TtsLimiter implements TtsProvider {
  private active = 0;
  private readonly waiting: Waiting[] = [];
  constructor(private readonly inner: TtsProvider) {}
  private acquire(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    if (this.active < 2) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const entry: Waiting = {
        resolve,
        reject,
        ...(signal ? { signal } : {}),
        abort: (): void => {
          const index = this.waiting.indexOf(entry);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(new AppError('REQUEST_ABORTED', 'Speech request cancelled'));
        },
      };
      signal?.addEventListener('abort', entry.abort, { once: true });
      this.waiting.push(entry);
    });
  }
  private release(): void {
    this.active -= 1;
    const next = this.waiting.shift();
    if (!next) return;
    next.signal?.removeEventListener('abort', next.abort);
    this.active += 1;
    next.resolve();
  }
  async synthesize(
    text: string,
    lang: string,
    signal?: AbortSignal,
  ): Promise<TtsResult> {
    const started = performance.now();
    await this.acquire(signal);
    try {
      throwIfAborted(signal);
      const result = await this.inner.synthesize(text, lang, signal);
      return { ...result, ms: performance.now() - started };
    } finally {
      this.release();
    }
  }
}
