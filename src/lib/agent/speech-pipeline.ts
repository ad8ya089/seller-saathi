import { AppError } from '@/lib/errors';
import { abortable, throwIfAborted } from '@/lib/voice/abort';
import type { TtsProvider, TtsResult } from '@/lib/voice/providers';
import { validateWav } from '@/lib/voice/wav';
import { VOICE_LIMITS } from '@/lib/voice/limits';
import type { EmitEchoEvent } from '@/lib/voice/events';

export type PreparedAudio = { ok: true; result: TtsResult } | { ok: false };
export class SpeechPipeline {
  private readonly active = new Set<Promise<void>>();
  private tail = Promise.resolve();
  private failure: Error | undefined;
  private index = 0;
  firstTtsMs = 0;
  firstAudioMs = 0;
  ttsChars = 0;
  fallbacks = 0;
  retries = 0;
  constructor(
    private readonly tts: TtsProvider | undefined,
    private readonly emit: EmitEchoEvent,
    private readonly signal: AbortSignal,
    private readonly started: number,
    private readonly now: () => number = performance.now.bind(performance),
  ) {}
  async prepare(text: string): Promise<PreparedAudio> {
    if (!this.tts) return { ok: false };
    this.ttsChars += text.length;
    try {
      const result = await abortable(
        this.tts.synthesize(text, 'en-IN', this.signal),
        this.signal,
      );
      this.retries += Math.max(0, (result.attempts ?? 1) - 1);
      validateWav(result.wav, {
        sampleRates: [VOICE_LIMITS.outputSampleRate],
        maxBytes: VOICE_LIMITS.ttsAudioBytes,
        maxDurationMs: 120000,
      });
      return { ok: true, result };
    } catch {
      throwIfAborted(this.signal);
      return { ok: false };
    }
  }
  async push(text: string, prepared?: PreparedAudio): Promise<void> {
    throwIfAborted(this.signal);
    if (this.failure) throw this.failure;
    while (this.active.size >= 2)
      await abortable(Promise.race(this.active), this.signal);
    const idx = this.index++;
    this.emit({ event: 'sentence', data: { idx, text } });
    if (!this.tts) return;
    const job = prepared ? Promise.resolve(prepared) : this.prepare(text);
    const release: Promise<void> = job.then(
      () => {
        this.active.delete(release);
      },
      () => {
        this.active.delete(release);
      },
    );
    this.active.add(release);
    const ordered = this.tail.then(async (): Promise<void> => {
      const outcome = await job;
      throwIfAborted(this.signal);
      if (outcome.ok) {
        if (!this.firstTtsMs) this.firstTtsMs = outcome.result.ms;
        if (!this.firstAudioMs) this.firstAudioMs = this.now() - this.started;
        this.emit({
          event: 'audio',
          data: {
            idx,
            mime: 'audio/wav',
            b64: outcome.result.wav.toString('base64'),
          },
        });
      } else {
        this.fallbacks += 1;
        this.emit({
          event: 'fallback',
          data: {
            kind: 'tts',
            message:
              'Voice synthesis failed for this sentence. Your browser will read its text.',
          },
        });
      }
    });
    this.tail = ordered.catch((error: unknown) => {
      this.failure =
        error instanceof Error
          ? error
          : new AppError('INTERNAL', 'Speech delivery failed');
    });
  }
  async finish(): Promise<void> {
    await this.tail;
    if (this.failure) throw this.failure;
    throwIfAborted(this.signal);
  }
  publishReceipt(text: string, prepared?: PreparedAudio): void {
    const idx = this.index++;
    this.emit({ event: 'sentence', data: { idx, text } });
    if (!this.tts) return;
    if (prepared?.ok) {
      if (!this.firstTtsMs) this.firstTtsMs = prepared.result.ms;
      if (!this.firstAudioMs) this.firstAudioMs = this.now() - this.started;
      this.emit({
        event: 'audio',
        data: {
          idx,
          mime: 'audio/wav',
          b64: prepared.result.wav.toString('base64'),
        },
      });
    } else
      this.emit({
        event: 'fallback',
        data: {
          kind: 'tts',
          message:
            'Voice synthesis failed for this sentence. Your browser will read its text.',
        },
      });
  }
  async cancel(): Promise<void> {
    await Promise.allSettled([...this.active, this.tail]);
  }
}
