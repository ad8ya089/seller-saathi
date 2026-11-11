import type { ActionPlan } from '@/lib/domain/plan';
import { spokenNumber } from '@/lib/domain/spoken-numbers';
import { ACTION_POLICY } from '@/lib/domain/action-context';
import { ACTION_CATALOG } from '@/lib/domain/action-catalog';
import type { Hypothesis, SellerActionId } from '@/lib/domain/types';
import type { Language } from '@/lib/voice/language';
import { HINDI_ACTION_TITLES } from '@/lib/domain/call-language';

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
export function spokenActionTitles(
  plan: ActionPlan,
  language: Language = 'en-IN',
): string[] {
  if (language === 'hi-IN')
    return plan.actions.map((action) => HINDI_ACTION_TITLES[action.id]);
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
  language: Language = 'en-IN',
): string {
  if (language === 'hi-IN') {
    const titles: Record<SellerActionId, string> = {
      A_RESTOCK_TOP: 'stock mangaiye',
      A_STOCK_SYNC: 'panel stock milaiye',
      A_PUSH_INSTOCK: 'in-stock products promote kijiye',
      A_DISPATCH_SLA: 'handover sudhariye',
      A_VISIBILITY_AUDIT: 'views check kijiye',
      A_PRICE_CHECK: 'prices compare kijiye',
    };
    const issues: Record<Hypothesis, string> = {
      STOCK: 'stock ki kami',
      FULFIL: 'dispatch ki deri',
      VIS: 'visibility',
      PRICE: 'price ki dikkat',
      DEMAND: 'demand ki dikkat',
    };
    const steps = plan.actions
      .filter(
        (action) => !acceptedActionIds || acceptedActionIds.includes(action.id),
      )
      .map((action) => {
        const due =
          ACTION_CATALOG.find((entry) => entry.id === action.id)?.dueDays ?? 0;
        return `${titles[action.id]}${action.id === 'A_RESTOCK_TOP' || action.id === 'A_DISPATCH_SLA' ? ` ${spokenNumber(due)} din mein` : ''}`;
      });
    const last = steps.pop() ?? '';
    return `${issues[issue]} ke liye ${steps.length ? `${steps.join(', ')} aur ` : ''}${last}; ${spokenNumber(ACTION_POLICY.followUpDays)} din baad orders, cancellations aur stock review karenge.`;
  }
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
