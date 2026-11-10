import { getRuntime } from '@/lib/server/runtime';
import { apiFailure, createLedgerHandler } from '@/lib/server/agent-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  try {
    return await createLedgerHandler(getRuntime())();
  } catch (error: unknown) {
    return apiFailure(error);
  }
}
