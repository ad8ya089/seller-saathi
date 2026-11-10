import { z } from 'zod';
export type { PlanAction, ActionPlan, CommittedPlan } from '@/lib/domain/plan';
import type {
  SellerSnapshot,
  SkuData,
  CancellationData,
} from '@/lib/domain/data-schemas';
export { sellerSnapshotSchema } from '@/lib/domain/data-schemas';
export type { SellerSnapshot } from '@/lib/domain/data-schemas';

export const phaseSchema = z.enum([
  'greeting',
  'intake',
  'findings',
  'investigate',
  'recommend',
  'confirm',
  'commit',
  'summary',
  'done',
]);
export type Phase = z.infer<typeof phaseSchema>;
export const signalIdSchema = z.enum([
  'S_ORDER_DROP',
  'S_ASP_FLAT',
  'S_OOS_SPIKE',
  'S_CANCEL_UP',
  'S_SKU_CONCENTRATION',
  'S_CANCEL_STOCK_DOMINANT',
  'S_CANCEL_DISPATCH_DOMINANT',
]);
export type SignalId = z.infer<typeof signalIdSchema>;
export const hypothesisSchema = z.enum([
  'STOCK',
  'FULFIL',
  'VIS',
  'PRICE',
  'DEMAND',
]);
export type Hypothesis = z.infer<typeof hypothesisSchema>;
export interface HypothesisScore {
  id: Hypothesis;
  score: number;
  level: 'high' | 'medium' | 'low';
}
export const questionIdSchema = z.enum([
  'Q_OOS_CONFIRM',
  'Q_RESTOCK_ETA',
  'Q_DISPATCH',
  'Q_VIEWS',
  'Q_UNDERCUT',
  'Q_CAPACITY',
]);
export type QuestionId = z.infer<typeof questionIdSchema>;
export const actionIdSchema = z.enum([
  'A_RESTOCK_TOP',
  'A_STOCK_SYNC',
  'A_PUSH_INSTOCK',
  'A_DISPATCH_SLA',
  'A_VISIBILITY_AUDIT',
  'A_PRICE_CHECK',
  'A_FOLLOWUP',
]);
export type ActionId = z.infer<typeof actionIdSchema>;
export type SellerActionId = Exclude<ActionId, 'A_FOLLOWUP'>;
export const factIdSchema = z.enum([
  'oos_confirmed',
  'restock_cause',
  'restock_eta_days',
  'dispatch_on_time',
  'views_dropped',
  'competitor_undercut',
  'can_restock_partial',
]);
export type FactId = z.infer<typeof factIdSchema>;
const factMetadata = {
  quote: z.string().trim().min(1),
  turn: z.number().int().nonnegative(),
};
export const sellerFactSchema = z.discriminatedUnion('factId', [
  z.strictObject({
    ...factMetadata,
    factId: z.literal('oos_confirmed'),
    value: z.enum(['yes', 'no', 'partial']),
  }),
  z.strictObject({
    ...factMetadata,
    factId: z.literal('restock_cause'),
    value: z.enum(['supplier_delay', 'cash_constraint', 'unaware', 'other']),
  }),
  z.strictObject({
    ...factMetadata,
    factId: z.literal('restock_eta_days'),
    value: z.number().int().nonnegative(),
  }),
  z.strictObject({
    ...factMetadata,
    factId: z.literal('dispatch_on_time'),
    value: z.enum(['yes', 'no', 'sometimes']),
  }),
  z.strictObject({
    ...factMetadata,
    factId: z.literal('views_dropped'),
    value: z.enum(['yes', 'no', 'unknown']),
  }),
  z.strictObject({
    ...factMetadata,
    factId: z.literal('competitor_undercut'),
    value: z.enum(['yes', 'no', 'unknown']),
  }),
  z.strictObject({
    ...factMetadata,
    factId: z.literal('can_restock_partial'),
    value: z.enum(['yes', 'no']),
  }),
]);
export type SellerFact = z.infer<typeof sellerFactSchema>;
export const sellerFactsSchema = z
  .partialRecord(factIdSchema, sellerFactSchema)
  .superRefine((facts, context) => {
    for (const [key, fact] of Object.entries(facts)) {
      if (key !== fact.factId)
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Fact key must match factId',
        });
    }
  });
export type SellerFacts = z.infer<typeof sellerFactsSchema>;
export type Evidence =
  | { source: 'data'; id: SignalId; description: string; value: number | null }
  | { source: 'seller'; fact: SellerFact };
export interface Signal {
  id: SignalId;
  triggered: boolean;
  evidence: Extract<Evidence, { source: 'data' }>;
}
export type DataTool =
  | 'get_seller_snapshot'
  | 'get_sku_breakdown'
  | 'get_cancellation_breakdown'
  | 'get_listing_funnel';
export interface DomainState {
  snapshot: SellerSnapshot;
  skus?: SkuData;
  cancellations?: CancellationData;
  facts: SellerFacts;
  questionsAsked: readonly QuestionId[];
  toolsCalled: ReadonlySet<DataTool>;
}
export interface InvestigationState {
  facts: SellerFacts;
  questionsAsked: readonly QuestionId[];
  hypotheses: readonly HypothesisScore[];
}
export interface Diagnosis {
  signals: Signal[];
  hypotheses: HypothesisScore[];
  evidence: Evidence[];
  suggestedNextQuestion: QuestionId | null;
  questionsLeft: number;
  readyToRecommend: boolean;
}
