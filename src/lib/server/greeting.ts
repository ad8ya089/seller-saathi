import 'server-only';
import { AppError } from '@/lib/errors';
import { abortable } from '@/lib/voice/abort';
import type { TtsProvider } from '@/lib/voice/providers';
import { validateWav } from '@/lib/voice/wav';
import { VOICE_LIMITS } from '@/lib/voice/limits';
import type { Language } from '@/lib/voice/language';

export const GREETING =
  "Hello, I'm Snapdeal's Virtual Account Manager, an AI assistant. How can I help you today?";
export const HINDI_GREETING =
  'Namaste, main Snapdeal ka Virtual Account Manager, ek AI assistant hoon. Aaj main aapki kaise madad kar sakta hoon?';
export class GreetingCache {
  private readonly variants = new Map<string, GreetingCache>();
  private failedAt = -Infinity;
  private pending:
    Promise<{ text: string; audioB64: string; mime: 'audio/wav' }> | undefined;
  constructor(
    private readonly tts: TtsProvider,
    private readonly identity: object = {},
    private readonly language: Language = 'en-IN',
    private readonly text: string = GREETING,
  ) {}
  get(
    signal?: AbortSignal,
    lang: Language = this.language,
    text: string = lang === 'hi-IN' ? HINDI_GREETING : GREETING,
  ): Promise<{ text: string; audioB64: string; mime: 'audio/wav' }> {
    if (lang !== this.language || text !== this.text) {
      const key = JSON.stringify([lang, this.identity, text]);
      let variant = this.variants.get(key);
      if (!variant) {
        variant = new GreetingCache(this.tts, this.identity, lang, text);
        this.variants.set(key, variant);
      }
      // Passing the exact text also supports a distinct simulated-review intro.
      return variant.get(signal, lang, text);
    }
    if (performance.now() - this.failedAt < 30000)
      return Promise.reject(
        new AppError(
          'PROVIDER_UNAVAILABLE',
          'Greeting temporarily unavailable',
        ),
      );
    this.pending ??= this.tts
      .synthesize(this.text, this.language)
      .then((result) => {
        validateWav(result.wav, {
          sampleRates: [VOICE_LIMITS.outputSampleRate],
          maxBytes: VOICE_LIMITS.ttsAudioBytes,
          maxDurationMs: 120000,
        });
        return {
          text: this.text,
          audioB64: result.wav.toString('base64'),
          mime: 'audio/wav' as const,
        };
      })
      .catch((error: unknown) => {
        this.pending = undefined;
        this.failedAt = performance.now();
        throw error;
      });
    return signal ? abortable(this.pending, signal) : this.pending;
  }
}
