import { getRuntime } from '@/lib/server/runtime';
import { assertAccess } from '@/lib/server/access';
import { apiFailure } from '@/lib/server/agent-api';
import { languageSchema } from '@/lib/voice/language';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request): Response {
  try {
    const app = getRuntime();
    assertAccess(request, app.config);
    const language = languageSchema.parse(
      new URL(request.url).searchParams.get('lang') ?? 'en-IN',
    );
    if (language === 'hi-IN' && !app.config.hinglishEnabled)
      throw new AppError('INVALID_INPUT', 'Hindi/Hinglish is not enabled');
    // Readiness only: this route never generates paid audio.
    return Response.json(app.clipsFor(language).snapshot(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: unknown) {
    return apiFailure(error);
  }
}
