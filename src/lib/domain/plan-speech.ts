import type { ActionPlan } from '@/lib/domain/plan';
import { spokenNumber } from '@/lib/domain/spoken-numbers';
import { ACTION_POLICY } from '@/lib/domain/action-context';
import { ACTION_CATALOG } from '@/lib/domain/action-catalog';
import type { Hypothesis, SellerActionId } from '@/lib/domain/types';

const SHORT_ACTIONS: Readonly<Record<SellerActionId, string>> = {
  A_RESTOCK_TOP: 'order priority stock',
  A_STOCK_SYNC: 'match panel stock today',
  A_PUSH_INSTOCK: 'promote available products',
  A_DISPATCH_SLA: 'fix packing and handover',
  A_VISIBILITY_AUDIT: 'check product views and listings',
  A_PRICE_CHECK: 'compare competitor prices',
};
const ISSUES: Readonly<Record<Hypothesis, string>> = {
  STOCK: 'stock shortages',
  FULFIL: 'dispatch delays',
  VIS: 'visibility concerns',
  PRICE: 'price concerns',
  DEMAND: 'demand concerns',
};
export function spokenActionTitles(plan: ActionPlan): string[] {
  return plan.actions.map((action) =>
    action.title.replace(/\b\d+(?:\.\d+)?\b/g, (number) =>
      spokenNumber(Number(number)),
    ),
  );
}
export function planSummary(
  plan: ActionPlan,
  issue: Hypothesis = 'STOCK',
  acceptedActionIds?: readonly string[],
): string {
  const actions = plan.actions
    .filter(
      (action) => !acceptedActionIds || acceptedActionIds.includes(action.id),
    )
    .map((action) => {
      const title = SHORT_ACTIONS[action.id];
      if (action.id !== 'A_RESTOCK_TOP' && action.id !== 'A_DISPATCH_SLA')
        return title;
      const due =
        ACTION_CATALOG.find((entry) => entry.id === action.id)?.dueDays ?? 0;
      return `${title} in ${spokenNumber(due)} days`;
    });
  const last = actions.pop();
  const list = actions.length
    ? `${actions.join(', ')} and ${last ?? ''}`
    : (last ?? '');
  return `To address ${ISSUES[issue]}, ${list}; I will review orders, cancellations and stock in ${spokenNumber(ACTION_POLICY.followUpDays)} days.`;
}
