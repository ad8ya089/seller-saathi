import { z } from 'zod';
import { getRuntime } from '@/lib/server/runtime';
import { apiFailure, createSessionHandler } from '@/lib/server/agent-api';
import { assertAccess } from '@/lib/server/access';
import { assertSameOrigin } from '@/lib/server/same-origin';
import { readJsonInput } from '@/lib/server/turn-input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  try {
    return await createSessionHandler(getRuntime())(request);
  } catch (error: unknown) {
    return apiFailure(error);
  }
}
export async function DELETE(request: Request): Promise<Response> {
  try {
    const app = getRuntime();
    assertSameOrigin(request, app.config);
    assertAccess(request, app.config);
    const input = z
      .strictObject({ sessionId: z.uuid() })
      .parse(await readJsonInput(request));
    getRuntime().sessions.remove(input.sessionId);
    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return apiFailure(error);
  }
}
