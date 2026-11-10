import type { ReactNode } from 'react';
import type { PlanAction } from '@/lib/domain/plan';
import { date } from '@/lib/client/format';

export function PlanActionCard({
  action,
  committed = false,
}: {
  action: PlanAction;
  committed?: boolean;
}): ReactNode {
  return (
    <article
      className="rounded-xl border border-slate-200 bg-white p-4"
      aria-label={action.title}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="badge-neutral">{action.owner}</span>
        <span className="text-slate-500">Due {date(action.dueDate)}</span>
        {committed && <span className="text-emerald-800">Committed</span>}
      </div>
      <h3 className="mt-3 text-sm font-semibold leading-6 text-slate-950">
        {action.title}
      </h3>
      {action.expectedStockDate && (
        <p className="mt-2 text-xs text-slate-600">
          Expected stock: {date(action.expectedStockDate)}
        </p>
      )}
      <dl className="mt-3 space-y-3 text-xs leading-5">
        <div>
          <dt className="font-medium text-slate-700">Success metric</dt>
          <dd className="mt-0.5 text-slate-600">{action.successMetric}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-700">Expected impact</dt>
          <dd className="mt-0.5 text-slate-600">{action.impact}</dd>
        </div>
      </dl>
    </article>
  );
}
