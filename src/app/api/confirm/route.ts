import { getRuntime } from '@/lib/server/runtime';
import { apiFailure, createConfirmHandler } from '@/lib/server/agent-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  try {
    return await createConfirmHandler(getRuntime())(request);
  } catch (error: unknown) {
    return apiFailure(error);
  }
}
