import { AppError } from '@/lib/errors';
import { ACTION_CATALOG } from '@/lib/domain/action-catalog';
import { actionContext, ACTION_POLICY } from '@/lib/domain/action-context';
import { calendarDate } from '@/lib/domain/dates';
import { actionPlanSchema } from '@/lib/domain/plan';
import type { ActionPlan } from '@/lib/domain/plan';
import type { DomainState, SellerActionId } from '@/lib/domain/types';
import type {
  InvestigationPolicy,
  SignalThresholds,
} from '@/lib/domain/settings';

interface PlanningOptions {
  actionIds?: readonly SellerActionId[];
  thresholds?: SignalThresholds;
  investigation?: InvestigationPolicy;
}

export interface ActionEvaluation {
  id: SellerActionId;
  title: string;
  eligible: boolean;
  feasibility: number;
  rankScore: number;
}

export function evaluateActions(
  state: DomainState,
  options?: PlanningOptions,
): ActionEvaluation[] {
  const context = actionContext(
    state,
    options?.thresholds,
    options?.investigation,
  );
  return ACTION_CATALOG.map((action) => {
    const feasibility = action.feasibility(context);
    return {
      id: action.id,
      title: action.title,
      eligible:
        action.eligible(context) &&
        feasibility > 0 &&
        (!state.review?.completedActionIds.includes(action.id) ||
          (action.id === 'A_RESTOCK_TOP' && state.review.remainingOos > 0)),
      feasibility,
      rankScore:
        (context.scores.get(action.hypothesis) ?? 0) *
        action.impactWeight *
        feasibility,
    };
  }).sort(
    (left, right) =>
      Number(right.eligible) - Number(left.eligible) ||
      right.rankScore - left.rankScore,
  );
}

export function buildPlan(
  state: DomainState,
  today: Date,
  planId?: string,
  options?: PlanningOptions,
): ActionPlan {
  const createdDate = calendarDate(today);
  const context = actionContext(
    state,
    options?.thresholds,
    options?.investigation,
  );
  const eligible = evaluateActions(state, options).filter(
    (action) => action.eligible,
  );
  const selected = options?.actionIds
    ? options.actionIds.map((id) => {
        const entry = eligible.find((action) => action.id === id);
        if (!entry)
          throw new AppError(
            'INSUFFICIENT_ACTIONS',
            'Selected action is not eligible',
          );
        return entry;
      })
    : eligible.slice(0, 3);
  if (
    selected.length > 3 ||
    new Set(selected.map((action) => action.id)).size !== selected.length
  )
    throw new AppError(
      'INSUFFICIENT_ACTIONS',
      'Select two or three unique eligible actions',
    );
  if (selected.length < 2)
    throw new AppError(
      'INSUFFICIENT_ACTIONS',
      'Planning requires at least two eligible seller actions',
    );
  const recoveryCeiling = context.inventory?.recoveryCeiling ?? 0;
  const ceilingText = `Recover up to ₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(recoveryCeiling)} if fully recovered; this is a ceiling, not a forecast.`;
  const includesRestock = selected.some(
    (action) => action.id === 'A_RESTOCK_TOP',
  );
  const impact = includesRestock
    ? ceilingText
    : 'Focus on available stock and prevent avoidable cancellations; recovery is not forecast.';
  const eta = state.facts.restock_eta_days?.value;
  const restockEtaDays = typeof eta === 'number' ? eta : null;
  const actions = selected.map((evaluation) => {
    const action = ACTION_CATALOG.find((entry) => entry.id === evaluation.id);
    if (!action)
      throw new AppError(
        'INSUFFICIENT_ACTIONS',
        'Action is not in the catalog',
      );
    const isRestock = action.id === 'A_RESTOCK_TOP';
    return {
      id: action.id,
      title: action.title,
      owner: 'Seller' as const,
      dueDate: calendarDate(today, action.dueDays),
      expectedStockDate:
        isRestock && restockEtaDays !== null
          ? calendarDate(today, restockEtaDays)
          : null,
      successMetric: action.successMetric(context),
      impact: isRestock
        ? ceilingText
        : 'Review progress at the follow-up; no outcome is guaranteed.',
      parameters: {
        productNames: (action.id === 'A_PUSH_INSTOCK'
          ? context.healthyHeroes
          : context.oosProducts
        ).map((sku) => sku.spokenName),
        ordersLast: isRestock
          ? (context.inventory?.oosOrdersLast ?? null)
          : null,
        ordersThis: isRestock
          ? (context.inventory?.oosOrdersThis ?? null)
          : null,
        recoverableOrders: isRestock
          ? (context.inventory?.oosDecline ?? null)
          : null,
        restockEtaDays: isRestock ? restockEtaDays : null,
      },
    };
  });
  const followUpDate = calendarDate(today, ACTION_POLICY.followUpDays);
  return actionPlanSchema.parse({
    id:
      planId ??
      `plan-${state.snapshot.sellerId}-${createdDate}-${selected.map((action) => action.id).join('-')}`,
    sellerId: state.snapshot.sellerId,
    createdDate,
    actions,
    followUpDate,
    recoveryCeiling,
    impact,
    checkpoint: {
      id: 'A_FOLLOWUP',
      title:
        'Virtual KAM review of orders, cancellation rate and out-of-stock count',
      owner: 'Virtual KAM',
      dueDate: followUpDate,
      expectedStockDate: null,
      successMetric:
        'Review orders, cancellation rate, stock and each seller commitment.',
      impact: 'Review progress; no automated Snapdeal changes.',
      parameters: {
        productNames: [],
        ordersLast: null,
        ordersThis: null,
        recoverableOrders: null,
        restockEtaDays: null,
      },
    },
  });
}
