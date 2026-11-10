import { z } from 'zod';
import { sellerSnapshotSchema } from '@/lib/domain/data-schemas';
import {
  hypothesisSchema,
  signalIdSchema,
  questionIdSchema,
  factIdSchema,
  sellerFactSchema,
} from '@/lib/domain/types';
import { agentStateSchema } from '@/lib/agent/contracts';

const dataEvidenceSchema = z.strictObject({
  source: z.literal('data'),
  id: signalIdSchema,
  description: z.string(),
  value: z.number().nullable(),
});
export const dashboardSnapshotSchema = z.object({
  seller: sellerSnapshotSchema,
  bridge: z.strictObject({
    salesDelta: z.number(),
    pct: z.number().nullable(),
    orderDelta: z.number(),
    priceEffect: z.number(),
    volumeEffect: z.number(),
  }),
  hypotheses: agentStateSchema.shape.hypotheses,
  signals: z.array(
    z.strictObject({
      id: signalIdSchema,
      triggered: z.boolean(),
      evidence: dataEvidenceSchema,
    }),
  ),
  evidence: z.array(
    z.union([
      dataEvidenceSchema,
      z.strictObject({ source: z.literal('seller'), fact: sellerFactSchema }),
    ]),
  ),
  suggestedNextQuestion: questionIdSchema.nullable(),
  questionsLeft: z.number().int().nonnegative(),
});
export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
const contributionSchema = z.strictObject({
  hypothesis: hypothesisSchema,
  contribution: z.string(),
});
export const dashboardReferenceSchema = z.strictObject({
  seller: sellerSnapshotSchema,
  deltas: z.strictObject({
    orders: z.number().nullable(),
    sales: z.number().nullable(),
    asp: z.number().nullable(),
    oos: z.number(),
    cancelPoints: z.number(),
  }),
  dataEvidence: z.array(
    z.strictObject({
      id: signalIdSchema,
      description: z.string(),
      detailed: z.boolean(),
      contributions: z.array(contributionSchema),
    }),
  ),
  factEvidence: z.array(
    z.strictObject({
      factId: factIdSchema,
      value: z.string(),
      contributions: z.array(contributionSchema),
    }),
  ),
  questions: z.record(questionIdSchema, z.string()),
});
export type DashboardReference = z.infer<typeof dashboardReferenceSchema>;
