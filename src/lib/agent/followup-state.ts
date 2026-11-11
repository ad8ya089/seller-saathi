import type { Session } from '@/lib/agent/session';
import { followupViewSchema } from '@/lib/domain/followup-types';
import type { FollowupView, FollowupPhase } from '@/lib/domain/followup-types';
import type { SellerData } from '@/lib/domain/data-schemas';
import { AppError } from '@/lib/errors';

// Data stays server-owned. The validated view is captured at session creation.
export function captureFollowupView(session: Session, data: SellerData): void {
  if (!session.followup) return;
  const context = session.followup;
  context.view = followupViewSchema.parse({
    synthetic: true,
    planId: context.original.plan.id,
    runId: context.runId,
    simulatedDate: context.simulatedDate,
    windowDays: data.followup.windowDays,
    rolling7: data.followup.rolling7,
    baselineOrdersPerDay: data.followup.baselineThisMonthOrdersPerDay,
    baselineCancelRate: data.seller.periods.this.cancelRate,
    baselineOosProducts: data.seller.periods.this.oosProducts,
    rows: context.rows,
    stock: data.skus.skus
      .filter((sku) => data.followup.skuStock[sku.sku] !== undefined)
      .map((sku) => ({
        sku: sku.sku,
        name: sku.spokenName,
        stock: data.followup.skuStock[sku.sku],
      })),
    phaseTrace: context.phaseTrace,
    auditQuestions: context.auditQuestions,
    auditRecorded: Boolean(context.audit),
    awaitingAcceptance: context.awaitingAcceptance,
    limitations: [
      'Illustrative synthetic data, not live Snapdeal results.',
      'Cancellation reasons are unavailable for this window; stock sync is not proven to have caused the improvement.',
      'Historical product orders are used for priority ranking only; no new monthly recovery forecast.',
    ],
  });
}
export function followupView(session: Session): FollowupView {
  const view = session.followup?.view;
  if (!view || !session.followup)
    throw new AppError('INVALID_INPUT', 'Follow-up data was not initialized');
  return followupViewSchema.parse({
    ...view,
    rows: session.followup.rows,
    phaseTrace: session.followup.phaseTrace,
    auditQuestions: session.followup.auditQuestions,
    auditRecorded: Boolean(session.followup.audit),
    awaitingAcceptance: session.followup.awaitingAcceptance,
  });
}
export function advanceFollowup(session: Session, next: FollowupPhase): void {
  const context = session.followup;
  const transitions: Readonly<Record<FollowupPhase, readonly FollowupPhase[]>> =
    {
      FOLLOWUP_INTRO: ['AUDIT'],
      AUDIT: ['RE_DIAGNOSE'],
      RE_DIAGNOSE: ['NEXT_STEPS'],
      NEXT_STEPS: ['DONE'],
      DONE: [],
    };
  if (!context || !transitions[context.phase].includes(next))
    throw new AppError('TOOL_NOT_ALLOWED', 'Invalid follow-up transition');
  context.phase = next;
  context.phaseTrace.push(next);
}
