import { getRuntime } from '@/lib/server/runtime';
import { assertAccess } from '@/lib/server/access';
import { apiFailure } from '@/lib/server/agent-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request): Response {
  try {
    const app = getRuntime();
    assertAccess(request, app.config);
    // Readiness only: this route never generates paid audio.
    return Response.json(app.clips.snapshot(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: unknown) {
    return apiFailure(error);
  }
}
