import { abortable, throwIfAborted } from '@/lib/voice/abort';
import type {
  SttProvider,
  SttResult,
  TtsProvider,
  TtsResult,
} from '@/lib/voice/providers';

interface FakeSttOptions {
  text?: string;
  ms?: number;
  error?: Error;
}
export class FakeStt implements SttProvider {
  readonly calls: { wav: Buffer; lang: string }[] = [];
  constructor(private readonly options: FakeSttOptions = {}) {}
  transcribe(
    wav: Buffer,
    lang: string,
    signal?: AbortSignal,
  ): Promise<SttResult> {
    throwIfAborted(signal);
    this.calls.push({ wav, lang });
    return this.options.error
      ? Promise.reject(this.options.error)
      : Promise.resolve({
          text: this.options.text ?? 'Please check my stock.',
          ms: this.options.ms ?? 3,
        });
  }
}
interface FakeTtsOptions {
  before?: (index: number) => Promise<void>;
  error?: Error;
}
export class FakeTts implements TtsProvider {
  readonly calls: { text: string; lang: string }[] = [];
  aborted = 0;
  constructor(
    private readonly wav: Buffer,
    private readonly options: FakeTtsOptions = {},
  ) {}
  async synthesize(
    text: string,
    lang: string,
    signal?: AbortSignal,
  ): Promise<TtsResult> {
    throwIfAborted(signal);
    const index = this.calls.length;
    this.calls.push({ text, lang });
    try {
      const before = this.options.before?.(index) ?? Promise.resolve();
      if (signal) await abortable(before, signal);
      else await before;
      throwIfAborted(signal);
      if (this.options.error) throw this.options.error;
      return { wav: this.wav, ms: 2 };
    } catch (error: unknown) {
      if (signal?.aborted) this.aborted += 1;
      throw error;
    }
  }
}
