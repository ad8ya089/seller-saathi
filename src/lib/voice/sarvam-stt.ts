import 'server-only';
import { AppError } from '@/lib/errors';
import {
  sttLanguageSchema,
  sttResponseSchema,
} from '@/lib/voice/sarvam-contracts';
import type { SttModel, SttMode } from '@/lib/voice/sarvam-contracts';
import { postSarvamJson } from '@/lib/voice/sarvam-http';
import type { SarvamHttpSettings } from '@/lib/voice/sarvam-http';
import type { SttProvider, SttResult } from '@/lib/voice/providers';
import { validateWav } from '@/lib/voice/wav';
import { VOICE_LIMITS } from '@/lib/voice/limits';

export interface SarvamSttSettings extends SarvamHttpSettings {
  model: SttModel;
  mode: SttMode;
}
export class SarvamStt implements SttProvider {
  constructor(
    private readonly settings: SarvamSttSettings,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async transcribe(
    wav: Buffer,
    lang: string,
    signal?: AbortSignal,
  ): Promise<SttResult> {
    if (!sttLanguageSchema.safeParse(lang).success)
      throw new AppError(
        'INVALID_INPUT',
        'The transcription language is not supported',
      );
    validateWav(wav, {
      sampleRates: [16000, 24000],
      maxDurationMs: 30000,
      maxBytes: VOICE_LIMITS.ttsAudioBytes,
    });
    const response = await postSarvamJson(
      'speech-to-text',
      this.settings,
      () => {
        const body = new FormData();
        body.set(
          'file',
          new Blob([new Uint8Array(wav)], { type: 'audio/wav' }),
          'utterance.wav',
        );
        body.set('model', this.settings.model);
        body.set('mode', this.settings.mode);
        body.set('language_code', lang);
        return { body };
      },
      this.fetcher,
      signal,
    );
    const parsed = sttResponseSchema.safeParse(response.body);
    if (!parsed.success)
      throw new AppError(
        'PROVIDER_RESPONSE_INVALID',
        'Sarvam returned an invalid transcription response',
      );
    const text = parsed.data.transcript.trim();
    if (!text)
      throw new AppError(
        'NO_SPEECH',
        'No speech was recognized. Please try again or use text input',
        true,
      );
    return {
      text,
      ms: response.ms,
      ...(response.attempts > 1 ? { attempts: response.attempts } : {}),
    };
  }
}
