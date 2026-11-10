import { getRuntime } from '@/lib/server/runtime';
import { apiFailure, createTurnHandler } from '@/lib/server/agent-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    return await createTurnHandler(getRuntime())(request);
  } catch (error: unknown) {
    return apiFailure(error);
  }
}
