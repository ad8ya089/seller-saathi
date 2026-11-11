import type { SellerData } from '@/lib/domain/data-schemas';
import type { AuditRow } from '@/lib/domain/followup-types';
import type { DomainState, SellerFacts } from '@/lib/domain/types';
import type { ActionPlan } from '@/lib/domain/plan';
import { actionPlanSchema } from '@/lib/domain/plan';
import { evaluateActions } from '@/lib/domain/actions';
import { ACTION_CATALOG } from '@/lib/domain/action-catalog';
import { ACTION_POLICY } from '@/lib/domain/action-context';
import { calendarDate } from '@/lib/domain/dates';
import type {
  SignalThresholds,
  InvestigationPolicy,
} from '@/lib/domain/settings';

export function followupState(
  data: SellerData,
  rows: readonly AuditRow[],
  facts: SellerFacts,
): DomainState {
  const review = data.followup;
  const skus = {
    ...data.skus,
    skus: data.skus.skus.flatMap((sku) => {
      const stock = review.skuStock[sku.sku];
      return stock === undefined ? [] : [{ ...sku, stock }];
    }),
  };
  const baselineOrders = Math.round(
    review.baselineThisMonthOrdersPerDay * review.windowDays,
  );
  // Equal windows are an internal comparison adapter, never newly reported business metrics.
  // Historic SKU orders are used only for priority ranking, not concentration or forecasts.
  return {
    snapshot: {
      ...data.seller,
      periods: {
        last: {
          ...data.seller.periods.this,
          label: 'Baseline equivalent seven days',
          orders: baselineOrders,
          sales: baselineOrders * data.seller.asp,
        },
        this: {
          label: 'Illustrative rolling seven days',
          orders: review.rolling7.orders,
          sales: review.rolling7.orders * data.seller.asp,
          asp: data.seller.asp,
          cancelRate: review.rolling7.cancelRate,
          oosProducts: review.rolling7.oosProducts,
        },
      },
    },
    skus,
    facts,
    questionsAsked: [],
    toolsCalled: new Set(['get_seller_snapshot', 'get_sku_breakdown']),
    review: {
      remainingOos: skus.skus.filter((sku) => sku.stock === 0).length,
      partialRestock: rows.some(
        (row) => row.id === 'A_RESTOCK_TOP' && row.status === 'partial',
      ),
      stockSyncIncomplete: rows.some(
        (row) =>
          row.id === 'A_STOCK_SYNC' &&
          ['partial', 'not_done'].includes(row.status),
      ),
      completedActionIds: rows
        .filter((row) => row.status === 'done')
        .map((row) => row.id),
    },
  };
}
export function buildFollowupPlan(
  state: DomainState,
  today: Date,
  id: string,
  parentPlanId: string,
  runId: string,
  settings?: {
    thresholds?: SignalThresholds;
    investigation?: InvestigationPolicy;
  },
): ActionPlan | null {
  const selected = evaluateActions(state, settings)
    .filter((action) => action.eligible)
    .slice(0, 2);
  if (!selected.length) return null;
  const followUpDate = calendarDate(today, ACTION_POLICY.followUpDays);
  const parameters = {
    productNames: [] as string[],
    ordersLast: null,
    ordersThis: null,
    recoverableOrders: null,
    restockEtaDays: null,
  };
  return actionPlanSchema.parse({
    id,
    sellerId: state.snapshot.sellerId,
    createdDate: calendarDate(today),
    review: { parentPlanId, runId, simulatedDate: calendarDate(today) },
    recoveryCeiling: null,
    impact: 'Illustrative review; no forecast or causal claim.',
    followUpDate,
    actions: selected.map((evaluation) => {
      const spec = ACTION_CATALOG.find((entry) => entry.id === evaluation.id);
      if (!spec) throw new Error('Unknown catalog action');
      const restock = spec.id === 'A_RESTOCK_TOP';
      const etaValue = restock
        ? state.facts.restock_eta_days?.value
        : undefined;
      const eta = typeof etaValue === 'number' ? etaValue : undefined;
      return {
        id: spec.id,
        title: spec.title,
        owner: 'Seller',
        dueDate: calendarDate(today, spec.dueDays),
        expectedStockDate: eta === undefined ? null : calendarDate(today, eta),
        successMetric: restock
          ? `Review remaining zero-stock priority products from ${String(state.review?.remainingOos ?? 0)} toward zero.`
          : 'Review completion and the next available orders, cancellation rate and stock figures.',
        impact: restock
          ? 'Priority products remain at zero stock in the validated sample, so further restock is proposed; no guaranteed outcome.'
          : 'Further work proposed; no guaranteed outcome or automated change.',
        parameters: {
          ...parameters,
          productNames: (state.skus?.skus ?? [])
            .filter((sku) =>
              restock
                ? sku.stock === 0
                : sku.stock >= ACTION_POLICY.healthyStockMin,
            )
            .sort((a, b) => b.ordersLast - a.ordersLast)
            .map((sku) => sku.spokenName),
          restockEtaDays: eta ?? null,
        },
      };
    }),
    checkpoint: {
      id: 'A_FOLLOWUP',
      title: 'Virtual KAM review of orders, cancellation rate and stock',
      owner: 'Virtual KAM',
      dueDate: followUpDate,
      expectedStockDate: null,
      successMetric: 'Review each new commitment using available evidence.',
      impact: 'Simulated review intention only.',
      parameters,
    },
  });
}
