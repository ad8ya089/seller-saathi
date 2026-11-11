import type { ReactNode } from 'react';
import type { AppState } from '@/lib/client/app-state';
import { PlanActionCard } from '@/components/PlanActionCard';
import { date, number, percent } from '@/lib/client/format';

const STATUS = {
  done: 'Done',
  partial: 'Partial',
  not_done: 'Not done',
  not_available: 'Not available',
} as const;
export function FollowupPanel({
  state,
  onConfirm,
}: {
  state: AppState;
  onConfirm: (decision: 'accept' | 'decline') => Promise<void>;
}): ReactNode {
  const view = state.agent?.followup;
  if (!view) return null;
  const saved = state.agent?.committed === true;
  const record = saved ? state.committedPlan : null;
  const plan = saved ? record?.plan : state.agent?.plan;
  const canConfirm =
    state.active &&
    view.awaitingAcceptance &&
    !state.initializing &&
    state.phase === 'listening' &&
    !state.confirmation &&
    !state.errorCode;
  const actions = record
    ? record.plan.actions.filter((action) =>
        record.acceptedActionIds.includes(action.id),
      )
    : (plan?.actions ?? []);
  return (
    <div className="space-y-5 p-5 sm:p-6" aria-label="Simulated Day-7 review">
      <header>
        <p className="eyebrow">Simulated Day-7 review</p>
        <h2 className="mt-2 text-xl font-semibold">
          Progress and remaining work
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Illustrative synthetic data — not live Snapdeal results.
        </p>
        <p className="mt-2 break-all text-xs text-slate-500">
          Original plan: {view.planId} · Simulated date:{' '}
          {date(view.simulatedDate)}
        </p>
      </header>
      <section aria-label="Commitment audit" className="space-y-3">
        <h3 className="text-sm font-semibold">Original commitments</h3>
        {view.rows.map((row) => (
          <article
            key={row.id}
            className="rounded-xl border border-slate-200 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 className="min-w-0 flex-1 text-sm font-medium">
                {row.title}
              </h4>
              <span
                className={
                  row.status === 'done' ? 'badge-saved' : 'badge-neutral'
                }
              >
                {STATUS[row.status]}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {row.source === 'sample'
                ? 'Illustrative sample data'
                : 'Seller-reported correction'}
            </p>
            {row.quote && (
              <blockquote className="mt-2 text-sm text-slate-700">
                “{row.quote}”
              </blockquote>
            )}
          </article>
        ))}
        <p className="text-xs text-slate-500">
          {view.auditRecorded
            ? 'Audit recorded separately; the original commitment is unchanged.'
            : 'Awaiting your audit confirmation or correction.'}
        </p>
      </section>
      <section
        aria-label="Rolling seven-day metrics"
        className="rounded-xl bg-slate-50 p-4"
      >
        <h3 className="text-sm font-semibold">
          Illustrative rolling {number(view.windowDays)} days
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">Orders per day</dt>
            <dd className="mt-1 font-semibold">
              {number(view.rolling7.ordersPerDay)}{' '}
              <span className="font-normal text-slate-500">
                vs {number(view.baselineOrdersPerDay)} baseline
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Orders</dt>
            <dd className="mt-1 font-semibold">
              {number(view.rolling7.orders)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Cancellation rate</dt>
            <dd className="mt-1 font-semibold">
              {percent(view.rolling7.cancelRate)}{' '}
              <span className="font-normal text-slate-500">
                vs {percent(view.baselineCancelRate)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Out-of-stock listings</dt>
            <dd className="mt-1 font-semibold">
              {number(view.rolling7.oosProducts)}{' '}
              <span className="font-normal text-slate-500">
                vs {number(view.baselineOosProducts)}
              </span>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-5 text-slate-600">
          Improvement is illustrative correlation. Updated cancellation reasons
          are unavailable, so stock sync is not proven to have caused it.
        </p>
      </section>
      <section aria-label="Remaining stock gaps">
        <h3 className="text-sm font-semibold">Priority product stock</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {view.stock.map((row) => (
            <li className="flex flex-wrap justify-between gap-2" key={row.sku}>
              <span>{row.name}</span>
              <span
                className={
                  row.stock === 0
                    ? 'font-medium text-amber-900'
                    : 'text-slate-600'
                }
              >
                {row.stock === 0
                  ? 'Out of stock'
                  : `${number(row.stock)} in stock`}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section
        aria-label="Follow-up next steps"
        className="space-y-3 border-t border-slate-200 pt-5"
      >
        <h3 className="text-base font-semibold">
          {saved ? 'Confirmed new actions' : 'Proposed next steps'}
        </h3>
        {saved ? (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950"
          >
            Saved to demo ledger — not sent to Snapdeal
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            {plan
              ? 'These new actions are proposed. They have not been saved.'
              : state.agent?.phase === 'DONE'
                ? 'No new plan was saved.'
                : 'Your KAM will review eligible steps after the audit.'}
          </p>
        )}
        {actions.map((action) => (
          <PlanActionCard key={action.id} action={action} committed={saved} />
        ))}
        {plan && (
          <p className="text-xs leading-5 text-slate-500">
            Next simulated review: {date(plan.followUpDate)}. No monthly
            recovery forecast is available for this window.
          </p>
        )}
        {plan && !saved && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="button-primary flex-1"
              disabled={!canConfirm}
              onClick={(): void => {
                void onConfirm('accept');
              }}
            >
              {state.confirmation === 'accept' ? 'Saving…' : 'Confirm New Plan'}
            </button>
            <button
              type="button"
              className="button-secondary flex-1"
              disabled={!canConfirm}
              onClick={(): void => {
                void onConfirm('decline');
              }}
            >
              Not Now
            </button>
          </div>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-amber-900">
            Save was not confirmed. {state.error}
          </p>
        )}
        {state.ledgerError && saved && (
          <p role="status" className="text-sm text-amber-900">
            {state.ledgerError}
          </p>
        )}
      </section>
    </div>
  );
}
