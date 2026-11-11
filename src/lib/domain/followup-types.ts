import { z } from 'zod';
import { sellerActionIdSchema } from '@/lib/domain/plan';
import type { committedPlanSchema } from '@/lib/domain/plan';
import { followupDataSchema } from '@/lib/domain/data-schemas';
import { sellerFactsSchema } from '@/lib/domain/types';

export const followupPhaseSchema = z.enum([
  'FOLLOWUP_INTRO',
  'AUDIT',
  'RE_DIAGNOSE',
  'NEXT_STEPS',
  'DONE',
]);
export type FollowupPhase = z.infer<typeof followupPhaseSchema>;
export const auditRowSchema = z
  .strictObject({
    id: sellerActionIdSchema,
    title: z.string().min(1),
    status: z.enum(['done', 'partial', 'not_done', 'not_available']),
    source: z.enum(['sample', 'seller_reported']),
    quote: z.string().min(1).max(8000).optional(),
  })
  .refine((row) => row.source !== 'seller_reported' || Boolean(row.quote), {
    message: 'Seller status requires a quote',
  });
export type AuditRow = z.infer<typeof auditRowSchema>;
export const followupViewSchema = z.strictObject({
  synthetic: z.literal(true),
  planId: z.string().min(1),
  runId: z.uuid(),
  simulatedDate: z.iso.date(),
  windowDays: z.literal(7),
  rolling7: followupDataSchema.shape.rolling7,
  baselineOrdersPerDay: z.number().nonnegative(),
  baselineCancelRate: z.number().min(0).max(1),
  baselineOosProducts: z.number().int().nonnegative(),
  rows: z.array(auditRowSchema).max(3),
  stock: z.array(
    z.strictObject({
      sku: z.string(),
      name: z.string(),
      stock: z.number().int().nonnegative(),
    }),
  ),
  phaseTrace: z.array(followupPhaseSchema),
  auditQuestions: z.number().int().min(0).max(1),
  auditRecorded: z.boolean(),
  awaitingAcceptance: z.boolean(),
  limitations: z.array(z.string()),
});
export type FollowupView = z.infer<typeof followupViewSchema>;
export const followupAuditSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    event: z.literal('followup_audited'),
    planId: z.string().min(1),
    runId: z.uuid(),
    simulatedDate: z.iso.date(),
    recordedAt: z.iso.datetime(),
    rows: z.array(auditRowSchema).min(1).max(3),
    sellerQuote: z.string().min(1).max(8000),
    facts: sellerFactsSchema,
    phaseTrace: z.array(followupPhaseSchema),
  })
  .refine(
    (audit) =>
      new Set(audit.rows.map((row) => row.id)).size === audit.rows.length,
    { message: 'Audit actions must be unique' },
  );
export type FollowupAudit = z.infer<typeof followupAuditSchema>;
export interface FollowupContext {
  completedRecord?: z.infer<typeof committedPlanSchema>;
  view?: FollowupView;
  original: z.infer<typeof committedPlanSchema>;
  runId: string;
  simulatedDate: string;
  phase: FollowupPhase;
  phaseTrace: FollowupPhase[];
  rows: AuditRow[];
  auditQuestions: number;
  audit?: FollowupAudit;
  awaitingAcceptance: boolean;
}
