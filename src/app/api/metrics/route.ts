import { z } from 'zod';
import { getRuntime } from '@/lib/server/runtime';
import { getMetrics, operationalTurnSchema } from '@/lib/server/metrics';
import { assertAccess } from '@/lib/server/access';
import { assertSameOrigin } from '@/lib/server/same-origin';
import { readJsonInput } from '@/lib/server/turn-input';
import { apiFailure } from '@/lib/server/agent-api';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request): Response {
  try {
    const app = getRuntime();
    assertAccess(request, app.config);
    const id = z
      .uuid()
      .parse(new URL(request.url).searchParams.get('sessionId'));
    const record = getMetrics().session(id);
    return Response.json(record ? operationalTurnSchema.parse(record) : null, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: unknown) {
    return apiFailure(error);
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const app = getRuntime();
    assertAccess(request, app.config);
    const input = z
      .strictObject({
        sessionId: z.uuid(),
        turn: z.number().int().min(1).max(25),
      })
      .parse(await readJsonInput(request));
    const session = app.sessions.get(input.sessionId);
    if (input.turn > session.turn + 1)
      throw new AppError('INVALID_INPUT', 'Unknown turn');
    getMetrics().filler(input.sessionId, input.turn);
    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return apiFailure(error);
  }
}
