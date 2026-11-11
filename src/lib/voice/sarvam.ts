import 'server-only';
import { getConfig } from '@/lib/server/config';
import type { AppConfig } from '@/lib/server/config';
import { SarvamStt } from '@/lib/voice/sarvam-stt';
import { SarvamTts } from '@/lib/voice/sarvam-tts';
import type { VoiceProviders } from '@/lib/voice/providers';
import { sarvamProfile } from '@/lib/voice/language';
import type { Language } from '@/lib/voice/language';

export function createSarvamProviders(
  settings: AppConfig['sarvam'] = getConfig().sarvam,
  lang: Language = 'en-IN',
): VoiceProviders {
  const profile = sarvamProfile(settings, lang);
  return {
    stt: new SarvamStt({ ...settings, ...profile.stt }),
    tts: new SarvamTts({ ...settings, ...profile.tts }),
  };
}
