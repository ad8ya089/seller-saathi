import { ACTION_POLICY } from '@/lib/domain/action-context';
import type { ActionContext } from '@/lib/domain/action-context';
import type { Hypothesis, SellerActionId } from '@/lib/domain/types';

interface ActionSpec {
  id: SellerActionId;
  title: string;
  hypothesis: Hypothesis;
  impactWeight: number;
  dueDays: number;
  eligible: (context: ActionContext) => boolean;
  feasibility: (context: ActionContext) => number;
  successMetric: (context: ActionContext) => string;
}
const score = (context: ActionContext, id: Hypothesis): number =>
  context.scores.get(id) ?? 0;
const fullFeasibility = (): number => 1;

export const ACTION_CATALOG: readonly ActionSpec[] = [
  {
    id: 'A_RESTOCK_TOP',
    title: 'Restock your top sellers first, even a partial batch',
    hypothesis: 'STOCK',
    impactWeight: 1,
    dueDays: 2,
    eligible: (context) =>
      score(context, 'STOCK') >= 2 &&
      context.oosProducts.length > 0 &&
      context.facts.can_restock_partial?.value !== 'no',
    feasibility: (context): number => {
      if (context.facts.can_restock_partial?.value === 'no') return 0;
      if (context.facts.can_restock_partial?.value === 'yes') return 1;
      if (context.facts.restock_cause?.value === 'cash_constraint')
        return ACTION_POLICY.cashConstraintFeasibility;
      const eta = context.facts.restock_eta_days?.value;
      return typeof eta === 'number' && eta > ACTION_POLICY.delayedRestockDays
        ? ACTION_POLICY.delayedRestockFeasibility
        : 1;
    },
    successMetric: (context) =>
      `Zero-stock priority products from ${String(context.inventory?.oosCount ?? 0)} toward zero; monthly orders from ${String(context.inventory?.oosOrdersThis ?? 0)} back toward ${String(context.inventory?.oosOrdersLast ?? 0)}.`,
  },
  {
    id: 'A_STOCK_SYNC',
    title:
      "Match panel stock to physical stock today; zero anything you can't ship",
    hypothesis: 'STOCK',
    impactWeight: 0.9,
    dueDays: 0,
    eligible: (context) =>
      context.review?.stockSyncIncomplete === true ||
      (context.cancellations?.stockPct ?? 0) >=
        ACTION_POLICY.stockSyncMinSharePct,
    feasibility: fullFeasibility,
    successMetric: () =>
      `Stock-unavailable cancellations below ${String(ACTION_POLICY.weeklyStockCancelTarget)} per week.`,
  },
  {
    id: 'A_PUSH_INSTOCK',
    title:
      'Focus on in-stock best-sellers: keep a stock buffer, check photos and titles',
    hypothesis: 'STOCK',
    impactWeight: 0.8,
    dueDays: 3,
    eligible: (context) =>
      score(context, 'STOCK') >= 2 && context.healthyHeroes.length > 0,
    feasibility: fullFeasibility,
    successMetric: (context) =>
      `Increase orders per day on ${context.healthyHeroes.map((sku) => sku.spokenName).join(', ')}.`,
  },
  {
    id: 'A_DISPATCH_SLA',
    title: 'Fix pack-and-handover routine',
    hypothesis: 'FULFIL',
    impactWeight: 6,
    dueDays: 2,
    eligible: (context) =>
      score(context, 'FULFIL') >= 2 ||
      ['no', 'sometimes'].includes(
        String(context.facts.dispatch_on_time?.value),
      ),
    feasibility: fullFeasibility,
    successMetric: () =>
      `Dispatch-delay cancellations at most ${String(ACTION_POLICY.weeklyDispatchCancelTarget)} per week.`,
  },
  {
    id: 'A_VISIBILITY_AUDIT',
    title:
      'Check views per product after restock; refresh title and image on top sellers',
    hypothesis: 'VIS',
    impactWeight: 3,
    dueDays: 3,
    eligible: (context) => score(context, 'VIS') >= 2,
    feasibility: fullFeasibility,
    successMetric: (context) =>
      `Compare seller-panel views on ${context.oosProducts.map((sku) => sku.spokenName).join(', ') || 'priority products'} with last month; funnel data is unavailable here.`,
  },
  {
    id: 'A_PRICE_CHECK',
    title: `Compare ${String(ACTION_POLICY.priceComparisons)} competitor prices on top sellers before touching price`,
    hypothesis: 'PRICE',
    impactWeight: 2,
    dueDays: 3,
    eligible: (context) =>
      score(context, 'PRICE') >= 2 &&
      context.facts.competitor_undercut?.value === 'yes',
    feasibility: fullFeasibility,
    successMetric: () => 'Log a comparison decision; no blanket price cut.',
  },
];
