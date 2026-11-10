import { withAccess } from '@/lib/client/access';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { agentStateSchema, sessionResponseSchema } from '@/lib/agent/contracts';
import type { AgentState, SessionResponse } from '@/lib/agent/contracts';
import { abortable, throwIfAborted } from '@/lib/voice/abort';
import { httpError } from '@/lib/client/sse';
import { committedPlanSchema } from '@/lib/domain/plan';
import type { CommittedPlan } from '@/lib/domain/plan';

async function jsonPost(
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await abortable(
    fetch(path, {
      method: 'POST',
      headers: withAccess({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal,
      credentials: 'same-origin',
      mode: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
    }),
    signal,
  );
  if (!response.ok) throw await httpError(response);
  try {
    return await abortable(response.json() as Promise<unknown>, signal);
  } catch {
    throwIfAborted(signal);
    throw new AppError(
      'STREAM_INVALID',
      'The server returned an invalid session response',
    );
  }
}
export async function openVoiceSession(
  signal: AbortSignal,
): Promise<SessionResponse> {
  const result = sessionResponseSchema.safeParse(
    await jsonPost('/api/session', { lang: 'en-IN', mode: 'call' }, signal),
  );
  if (!result.success)
    throw new AppError(
      'STREAM_INVALID',
      'The server returned an invalid voice session',
    );
  return result.data;
}
export async function confirmVoicePlan(
  sessionId: string,
  planId: string,
  decision: 'accept' | 'decline',
  signal: AbortSignal,
): Promise<AgentState> {
  const result = agentStateSchema.safeParse(
    await jsonPost('/api/confirm', { sessionId, planId, decision }, signal),
  );
  if (!result.success)
    throw new AppError(
      'STREAM_INVALID',
      'The server returned an invalid plan confirmation',
    );
  return result.data;
}
export async function endVoiceSession(sessionId: string): Promise<void> {
  const response = await fetch('/api/session', {
    method: 'DELETE',
    headers: withAccess({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sessionId }),
    credentials: 'same-origin',
    mode: 'same-origin',
    redirect: 'error',
    keepalive: true,
  });
  if (!response.ok) throw await httpError(response);
  z.strictObject({ ok: z.literal(true) }).parse(await response.json());
}
export async function readCommittedPlan(
  planId: string,
  signal: AbortSignal,
): Promise<CommittedPlan | null> {
  const response = await abortable(
    fetch('/api/ledger', {
      credentials: 'same-origin',
      mode: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal,
    }),
    signal,
  );
  if (!response.ok) throw await httpError(response);
  const records = z
    .array(committedPlanSchema)
    .max(20)
    .parse(await abortable(response.json() as Promise<unknown>, signal));
  return records.find((record) => record.plan.id === planId) ?? null;
}
