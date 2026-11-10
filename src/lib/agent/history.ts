import { z } from 'zod';
import type { Session } from '@/lib/agent/session';
import type { ToolResponse } from '@/lib/llm/provider';

const RETAIN: Readonly<Record<string, readonly string[]>> = {
  get_seller_snapshot: [
    'bridge',
    'hypotheses',
    'readyToRecommend',
    'suggestedNextQuestion',
    'questionsLeft',
  ],
  get_sku_breakdown: ['synthetic', 'concentration', 'spokenEvidence'],
  get_cancellation_breakdown: ['synthetic', 'metrics', 'spokenEvidence'],
  record_seller_fact: [
    'recorded',
    'hypotheses',
    'readyToRecommend',
    'suggestedNextQuestion',
    'questionsLeft',
  ],
};
const successSchema = z.looseObject({ ok: z.literal(true) });
const hypothesisSchema = z.array(
  z.object({ id: z.string(), score: z.number(), level: z.string() }),
);
const factSchema = z.object({
  factId: z.string(),
  value: z.union([z.string(), z.number()]),
  turn: z.number(),
});
const bytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

function compact(result: ToolResponse): ToolResponse {
  const keys = RETAIN[result.name];
  if (
    !keys ||
    !successSchema.safeParse(result.response).success ||
    result.response.historySummary ||
    bytes(result.response) < 800
  )
    return result;
  const response: Record<string, unknown> = {
    ok: true,
    historySummary:
      'Completed tool result, summarized after consumption. Current facts, eligible actions and approved figures are supplied in the trusted turn context.',
  };
  for (const key of keys)
    if (Object.hasOwn(result.response, key))
      response[key] = result.response[key];
  const hypotheses = hypothesisSchema.safeParse(response.hypotheses);
  if (hypotheses.success) response.hypotheses = hypotheses.data;
  const fact = factSchema.safeParse(response.recorded);
  if (fact.success) response.recorded = fact.data;
  return bytes(response) < bytes(result.response)
    ? { ...result, response: successSchema.parse(response) }
    : result;
}

export function compactToolHistory(session: Session): {
  before: number;
  after: number;
} {
  const before = bytes(session.history);
  for (const turn of session.history) {
    if (!turn.spoken || turn.interrupted) continue;
    turn.messages = turn.messages.map((message) =>
      message.kind === 'tools'
        ? { ...message, results: message.results.map(compact) }
        : message,
    );
  }
  return { before, after: bytes(session.history) };
}
