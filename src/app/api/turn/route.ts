import { getConfig } from '@/lib/server/config';
import { getLogger } from '@/lib/server/logger';
import { createEchoHandler } from '@/lib/server/echo-turn';
import { createSarvamProviders } from '@/lib/voice/sarvam';
import { publicVoiceError } from '@/lib/server/voice-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const config = getConfig();
    return await createEchoHandler({
      providers: createSarvamProviders(config.sarvam),
      maxAudioBytes: config.maxUtteranceBytes,
      maxUtteranceMs: config.maxUtteranceMs,
      sttLanguage: config.sarvam.stt.language,
      ttsLanguage: config.sarvam.tts.language,
      onMetrics: (entry): void => {
        getLogger().info(entry, 'voice.echo.completed');
      },
    })(request);
  } catch (error: unknown) {
    return Response.json(publicVoiceError(error), {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
