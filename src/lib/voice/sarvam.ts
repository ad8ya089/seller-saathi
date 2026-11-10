import 'server-only';
import { getConfig } from '@/lib/server/config';
import type { AppConfig } from '@/lib/server/config';
import { SarvamStt } from '@/lib/voice/sarvam-stt';
import { SarvamTts } from '@/lib/voice/sarvam-tts';
import type { VoiceProviders } from '@/lib/voice/providers';

export function createSarvamProviders(
  settings: AppConfig['sarvam'] = getConfig().sarvam,
): VoiceProviders {
  return {
    stt: new SarvamStt({ ...settings, ...settings.stt }),
    tts: new SarvamTts({ ...settings, ...settings.tts }),
  };
}
