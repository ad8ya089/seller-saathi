import 'server-only';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import {
  compatibleSpeaker,
  ttsLanguageSchema,
  ttsResponseSchema,
} from '@/lib/voice/sarvam-contracts';
import type { TtsModel } from '@/lib/voice/sarvam-contracts';
import { postSarvamJson } from '@/lib/voice/sarvam-http';
import type { SarvamHttpSettings } from '@/lib/voice/sarvam-http';
import type { TtsProvider, TtsResult } from '@/lib/voice/providers';
import { validateWav } from '@/lib/voice/wav';
import { VOICE_LIMITS } from '@/lib/voice/limits';

export interface SarvamTtsSettings extends SarvamHttpSettings {
  model: TtsModel;
  speaker: string;
  pace: number;
  sampleRate: number;
}
const textSchema = z.string().trim().min(1).max(VOICE_LIMITS.ttsTextChars);
export class SarvamTts implements TtsProvider {
  constructor(
    private readonly settings: SarvamTtsSettings,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async synthesize(
    text: string,
    lang: string,
    signal?: AbortSignal,
  ): Promise<TtsResult> {
    const input = textSchema.safeParse(text);
    if (!input.success || !ttsLanguageSchema.safeParse(lang).success)
      throw new AppError('INVALID_INPUT', 'Speech text or language is invalid');
    if (
      !compatibleSpeaker(this.settings.model, this.settings.speaker) ||
      !z.number().min(0.5).max(2).safeParse(this.settings.pace).success ||
      this.settings.sampleRate !== VOICE_LIMITS.outputSampleRate
    )
      throw new AppError(
        'PROVIDER_CONFIG',
        'Sarvam model, speaker, pace or sample rate is incompatible',
      );
    const response = await postSarvamJson(
      'text-to-speech',
      this.settings,
      () => ({
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input.data,
          model: this.settings.model,
          language_code: lang,
          speaker: this.settings.speaker,
          pace: this.settings.pace,
          speech_sample_rate: this.settings.sampleRate,
          output_audio_codec: 'wav',
        }),
      }),
      this.fetcher,
      signal,
    );
    const parsed = ttsResponseSchema.safeParse(response.body);
    if (!parsed.success)
      throw new AppError(
        'PROVIDER_RESPONSE_INVALID',
        'Sarvam returned invalid or ambiguous speech audio',
      );
    const audio = parsed.data.audios[0];
    if (!audio)
      throw new AppError(
        'PROVIDER_RESPONSE_INVALID',
        'Sarvam returned no speech audio',
      );
    const wav = Buffer.from(audio, 'base64');
    try {
      validateWav(wav, {
        sampleRates: [this.settings.sampleRate],
        maxBytes: VOICE_LIMITS.ttsAudioBytes,
        maxDurationMs: 120000,
      });
    } catch {
      throw new AppError(
        'PROVIDER_RESPONSE_INVALID',
        'Sarvam returned unusable WAV audio',
      );
    }
    return {
      wav,
      ms: response.ms,
      ...(response.attempts > 1 ? { attempts: response.attempts } : {}),
    };
  }
}
