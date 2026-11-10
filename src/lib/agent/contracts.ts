import { z } from 'zod';
import { actionPlanSchema } from '@/lib/domain/plan';
import {
  phaseSchema,
  sellerFactSchema,
  hypothesisSchema,
} from '@/lib/domain/types';
import type { Session } from '@/lib/agent/session';

export const agentStateSchema = z.strictObject({
  phase: phaseSchema,
  questionsAsked: z.number().int().min(0).max(3),
  hypotheses: z.array(
    z.strictObject({
      id: hypothesisSchema,
      score: z.number(),
      level: z.enum(['low', 'medium', 'high']),
    }),
  ),
  facts: z.array(sellerFactSchema),
  plan: actionPlanSchema.optional(),
  committed: z.boolean().optional(),
});
export type AgentState = z.infer<typeof agentStateSchema>;
export function sessionState(session: Session): AgentState {
  return agentStateSchema.parse({
    phase: session.phase,
    questionsAsked: session.questionsAsked.length,
    hypotheses: session.hypotheses,
    facts: Object.values(session.facts),
    ...(session.proposedPlan ? { plan: session.proposedPlan.plan } : {}),
    committed: Boolean(session.committedPlan),
  });
}
export const sessionRequestSchema = z.strictObject({
  lang: z.literal('en-IN').default('en-IN'),
  mode: z.literal('call').default('call'),
});
export const sessionResponseSchema = z.strictObject({
  sessionId: z.uuid(),
  greeting: z.strictObject({
    text: z.string().min(1),
    audioB64: z.base64().min(1),
    mime: z.literal('audio/wav'),
  }),
  snapshot: z.record(z.string(), z.unknown()),
  config: z.strictObject({
    maxUtteranceMs: z.number().int().positive().max(28000),
    bargeIn: z.literal(false),
    maxQuestions: z.number().int().min(1).max(3),
  }),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export const confirmRequestSchema = z.strictObject({
  sessionId: z.uuid(),
  planId: z.string().min(1).max(128),
  decision: z.enum(['accept', 'decline']),
});
