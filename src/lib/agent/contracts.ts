import { z } from 'zod';
import { actionPlanSchema } from '@/lib/domain/plan';
import {
  phaseSchema,
  sellerFactSchema,
  hypothesisSchema,
} from '@/lib/domain/types';
import type { Session } from '@/lib/agent/session';
import { languageSchema } from '@/lib/voice/language';
import {
  followupPhaseSchema,
  followupViewSchema,
} from '@/lib/domain/followup-types';
import { followupView } from '@/lib/agent/followup-state';

export const agentStateSchema = z.strictObject({
  phase: z.union([phaseSchema, followupPhaseSchema]),
  mode: z.literal('followup').optional(),
  followup: followupViewSchema.optional(),
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
    phase: session.followup?.phase ?? session.phase,
    questionsAsked:
      session.followup?.auditQuestions ?? session.questionsAsked.length,
    ...(session.followup
      ? { mode: 'followup', followup: followupView(session) }
      : {}),
    hypotheses: session.hypotheses,
    facts: Object.values(session.facts),
    ...(session.proposedPlan ? { plan: session.proposedPlan.plan } : {}),
    committed: Boolean(session.committedPlan),
  });
}
export const sessionRequestSchema = z
  .strictObject({
    lang: languageSchema.default('en-IN'),
    mode: z.enum(['call', 'followup']).default('call'),
    planId: z.string().min(1).max(128).optional(),
    followupRunId: z.uuid().optional(),
  })
  .refine(
    (input) =>
      input.mode === 'followup'
        ? Boolean(input.planId)
        : !input.planId && !input.followupRunId,
    {
      message:
        'A follow-up requires a committed plan; recovery calls do not take plan identifiers',
    },
  );
export type SessionRequest = z.infer<typeof sessionRequestSchema>;
export const sessionResponseSchema = z
  .strictObject({
    sessionId: z.uuid(),
    lang: languageSchema.optional(),
    initialState: agentStateSchema.optional(),
    greeting: z.strictObject({
      text: z.string().min(1),
      audioB64: z.base64().min(1).nullable(),
      mime: z.literal('audio/wav'),
    }),
    snapshot: z.record(z.string(), z.unknown()),
    config: z.strictObject({
      maxUtteranceMs: z.number().int().positive().max(28000),
      bargeIn: z.boolean(),
      maxQuestions: z.number().int().min(1).max(3),
    }),
  })
  .refine(
    (response) =>
      response.greeting.audioB64 !== null || response.lang === 'hi-IN',
    { message: 'English greeting audio must be present' },
  );
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export const confirmRequestSchema = z.strictObject({
  sessionId: z.uuid(),
  planId: z.string().min(1).max(128),
  decision: z.enum(['accept', 'decline']),
});
