import { z } from 'zod';

export const thresholdSchema = z.strictObject({
  orderDropPct: z.number().min(-100).max(0).default(-15),
  aspFlatPct: z.number().nonnegative().default(3),
  oosRatio: z.number().min(1).default(2),
  oosIncrease: z.number().int().nonnegative().default(5),
  cancelIncreasePp: z.number().nonnegative().default(3),
  concentrationPct: z.number().min(0).max(100).default(70),
  stockCancelPct: z.number().min(0).max(100).default(50),
  dispatchCancelPct: z.number().min(0).max(100).default(40),
});
export type SignalThresholds = z.infer<typeof thresholdSchema>;
export const DEFAULT_THRESHOLDS: SignalThresholds = thresholdSchema.parse({});

export const investigationPolicySchema = z
  .strictObject({
    maxQuestions: z.number().int().min(1).max(3).default(3),
    minQuestions: z.number().int().min(1).max(3).default(2),
    readinessMargin: z.number().nonnegative().default(3),
  })
  .refine((policy) => policy.minQuestions <= policy.maxQuestions, {
    message: 'minQuestions must not exceed maxQuestions',
  });
export type InvestigationPolicy = z.infer<typeof investigationPolicySchema>;
export const DEFAULT_INVESTIGATION_POLICY: InvestigationPolicy =
  investigationPolicySchema.parse({});
