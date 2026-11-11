import { z } from 'zod';
import type { AppConfig } from '@/lib/server/config';

export const languageSchema = z.enum(['en-IN', 'hi-IN']);
export type Language = z.infer<typeof languageSchema>;
export type SarvamLanguageProfile = Pick<AppConfig['sarvam'], 'stt' | 'tts'>;

export function sarvamProfile(
  settings: AppConfig['sarvam'],
  lang: Language,
): SarvamLanguageProfile {
  return lang === 'hi-IN'
    ? { stt: { ...settings.hindi.stt }, tts: { ...settings.hindi.tts } }
    : {
        stt: { ...settings.stt, language: 'en-IN' },
        tts: { ...settings.tts, language: 'en-IN' },
      };
}

export function sarvamSmokePlan(settings: AppConfig['sarvam']): {
  requests: { tts: number; stt: number; maximum: number; retries: number };
  profile: SarvamLanguageProfile;
  text: string;
} {
  return {
    requests: { tts: 1, stt: 1, maximum: 2, retries: 0 },
    profile: sarvamProfile(settings, 'hi-IN'),
    text: 'Meri sale gir gayi hai. Supplier late hai, stock check karte hain.',
  };
}
