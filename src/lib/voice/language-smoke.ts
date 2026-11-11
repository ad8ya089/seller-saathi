import { AppError } from '@/lib/errors';
import type { VoiceProviders } from '@/lib/voice/providers';
import { validateWav } from '@/lib/voice/wav';

interface SmokeRequest {
  kind: 'tts' | 'stt';
  ok: boolean;
  ms?: number;
  code?: string;
}
export interface HinglishSmokeResult {
  passed: boolean;
  requests: SmokeRequest[];
  transcript?: string;
  wav?: Buffer;
}
export async function runHinglishSmoke(
  providers: VoiceProviders,
  text: string,
): Promise<HinglishSmokeResult> {
  const result: HinglishSmokeResult = { passed: false, requests: [] };
  let kind: SmokeRequest['kind'] = 'tts';
  try {
    const audio = await providers.tts.synthesize(text, 'hi-IN');
    validateWav(audio.wav, {
      sampleRates: [24000],
      maxDurationMs: 28000,
      maxBytes: 1048576,
    });
    result.wav = audio.wav;
    result.requests.push({ kind, ok: true, ms: audio.ms });
    kind = 'stt';
    const recognized = await providers.stt.transcribe(audio.wav, 'hi-IN');
    result.requests.push({ kind, ok: true, ms: recognized.ms });
    result.transcript = recognized.text;
    result.passed =
      /[\u0900-\u097F]|\b(meri|hai|hain|karte|gayi)\b/iu.test(
        recognized.text,
      ) && /stock|supplier/iu.test(recognized.text);
  } catch (error: unknown) {
    result.requests.push({
      kind,
      ok: false,
      code: error instanceof AppError ? error.code : 'INTERNAL',
    });
  }
  return result;
}
