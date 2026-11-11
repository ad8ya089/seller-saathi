import { z } from 'zod';
import { actionIdSchema, sellerFactsSchema } from '@/lib/domain/types';

export const sellerActionIdSchema = actionIdSchema.exclude(['A_FOLLOWUP']);
const parametersSchema = z.strictObject({
  productNames: z.array(z.string().min(1)),
  ordersLast: z.number().int().nonnegative().nullable(),
  ordersThis: z.number().int().nonnegative().nullable(),
  recoverableOrders: z.number().int().nonnegative().nullable(),
  restockEtaDays: z.number().int().nonnegative().nullable(),
});
export const planActionSchema = z.strictObject({
  id: actionIdSchema,
  title: z.string().min(1),
  owner: z.enum(['Seller', 'Virtual KAM']),
  dueDate: z.iso.date(),
  expectedStockDate: z.iso.date().nullable(),
  successMetric: z.string().min(1),
  impact: z.string().min(1),
  parameters: parametersSchema,
});
export type PlanAction = z.infer<typeof planActionSchema>;
const sellerPlanActionSchema = planActionSchema.extend({
  id: sellerActionIdSchema,
  owner: z.literal('Seller'),
});
const checkpointSchema = planActionSchema.extend({
  id: z.literal('A_FOLLOWUP'),
  owner: z.literal('Virtual KAM'),
});
export const actionPlanSchema = z
  .strictObject({
    id: z.string().min(1),
    sellerId: z.string().min(1),
    createdDate: z.iso.date(),
    actions: z.array(sellerPlanActionSchema).min(1).max(3),
    checkpoint: checkpointSchema,
    followUpDate: z.iso.date(),
    recoveryCeiling: z.number().nonnegative().nullable(),
    impact: z.string().min(1),
    review: z
      .strictObject({
        parentPlanId: z.string().min(1),
        runId: z.uuid(),
        simulatedDate: z.iso.date(),
      })
      .optional(),
  })
  .refine(
    (plan) =>
      plan.review
        ? plan.actions.length <= 2 &&
          plan.review.simulatedDate === plan.createdDate &&
          plan.recoveryCeiling === null
        : plan.actions.length >= 2 && plan.recoveryCeiling !== null,
    {
      message:
        'Initial plans need two or three actions; simulated reviews need one or two without a monthly forecast',
    },
  )
  .refine(
    (plan) =>
      new Set(plan.actions.map((action) => action.id)).size ===
      plan.actions.length,
    { message: 'Plan actions must be unique' },
  )
  .refine((plan) => plan.followUpDate === plan.checkpoint.dueDate, {
    message: 'Checkpoint must match follow-up date',
  })
  .refine(
    (plan) =>
      [...plan.actions, plan.checkpoint].every(
        (action) => action.dueDate >= plan.createdDate,
      ),
    { message: 'Due dates must not precede the plan date' },
  );
export type ActionPlan = z.infer<typeof actionPlanSchema>;

export const committedPlanSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    event: z.literal('plan_committed'),
    plan: actionPlanSchema,
    committedAt: z.iso.datetime(),
    acceptedActionIds: z.array(sellerActionIdSchema).min(1).max(3),
    sellerFacts: sellerFactsSchema.optional(),
  })
  .refine(
    (record) =>
      new Set(record.acceptedActionIds).size ===
        record.acceptedActionIds.length &&
      record.acceptedActionIds.every((id) =>
        record.plan.actions.some((action) => action.id === id),
      ),
    { message: 'Accepted action ids must be a unique subset of the plan' },
  );
export type CommittedPlan = z.infer<typeof committedPlanSchema>;
