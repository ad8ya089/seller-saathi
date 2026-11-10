import 'server-only';
import { abortable } from '@/lib/voice/abort';
import type { TtsProvider } from '@/lib/voice/providers';
import { validateWav } from '@/lib/voice/wav';
import { VOICE_LIMITS } from '@/lib/voice/limits';

export const GREETING =
  "Hello, I'm Snapdeal's Virtual Account Manager, an AI assistant. How can I help you today?";
export class GreetingCache {
  private pending:
    Promise<{ text: string; audioB64: string; mime: 'audio/wav' }> | undefined;
  constructor(private readonly tts: TtsProvider) {}
  get(
    signal?: AbortSignal,
  ): Promise<{ text: string; audioB64: string; mime: 'audio/wav' }> {
    this.pending ??= this.tts
      .synthesize(GREETING, 'en-IN')
      .then((result) => {
        validateWav(result.wav, {
          sampleRates: [VOICE_LIMITS.outputSampleRate],
          maxBytes: VOICE_LIMITS.ttsAudioBytes,
          maxDurationMs: 120000,
        });
        return {
          text: GREETING,
          audioB64: result.wav.toString('base64'),
          mime: 'audio/wav' as const,
        };
      })
      .catch((error: unknown) => {
        this.pending = undefined;
        throw error;
      });
    return signal ? abortable(this.pending, signal) : this.pending;
  }
}
