import type { ReactNode } from 'react';
import type { AppState } from '@/lib/client/app-state';
import { PlanActionCard } from '@/components/PlanActionCard';
import { date } from '@/lib/client/format';

export function PlanPanel({
  state,
  onConfirm,
}: {
  state: AppState;
  onConfirm: (decision: 'accept' | 'decline') => Promise<void>;
}): ReactNode {
  const saved = state.agent?.committed === true;
  const record = saved ? state.committedPlan : null;
  const plan = saved ? record?.plan : state.agent?.plan;
  const busy =
    state.initializing ||
    state.phase === 'processing' ||
    state.phase === 'speaking' ||
    state.confirmation !== null;
  const expired =
    state.errorCode === 'SESSION_EXPIRED' ||
    state.errorCode === 'SESSION_LIMIT' ||
    state.errorCode === 'SESSION_NOT_FOUND';
  const canConfirm =
    state.active && state.agent?.phase === 'confirm' && !busy && !expired;
  if (!plan && !saved)
    return (
      <div className="panel-empty">
        <span className="eyebrow">Recovery plan</span>
        <h2 className="mt-3 text-xl font-semibold">
          A practical plan, agreed together
        </h2>
        <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
          {state.planNotice ??
            'Your KAM will propose eligible actions after reviewing the evidence and your answers. Nothing is saved until you explicitly accept.'}
        </p>
        <p className="mt-6 text-xs leading-5 text-slate-500">
          Every proposed action includes an owner, due date and success metric,
          with a separate follow-up checkpoint.
        </p>
      </div>
    );
  const actions = record
    ? record.plan.actions.filter((action) =>
        record.acceptedActionIds.includes(action.id),
      )
    : (plan?.actions ?? []);
  return (
    <div className="space-y-5 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Recovery plan</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            {saved ? 'Your agreed next steps' : 'Proposed next steps'}
          </h2>
        </div>
        <span className={saved ? 'badge-saved' : 'badge-neutral'}>
          {saved ? 'Commitment confirmed' : 'Awaiting acceptance'}
        </span>
      </header>
      {saved ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-emerald-950">
            Saved to demo ledger — not sent to Snapdeal
          </p>
          <p className="mt-1 text-xs leading-5 text-emerald-900">
            {record
              ? `Follow-up: ${date(record.plan.followUpDate)}`
              : state.ledgerLoading
                ? 'Loading the accepted actions and actual follow-up date…'
                : 'The saved action details are not available.'}
          </p>
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-600">
          Review the actions your KAM proposed. Accept them by voice or confirm
          below; the server verifies the plan before saving.
        </p>
      )}
      {state.ledgerError && saved && (
        <p role="status" className="text-sm leading-6 text-amber-900">
          {state.ledgerError}
        </p>
      )}
      <div className="space-y-3">
        {actions.map((action) => (
          <PlanActionCard key={action.id} action={action} committed={saved} />
        ))}
      </div>
      {plan && (
        <section
          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
          aria-label="Day-7 follow-up checkpoint"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Day-7 follow-up checkpoint
            </h3>
            <span className="text-xs font-medium text-slate-700">
              {date(plan.checkpoint.dueDate)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-800">
            {plan.checkpoint.title}
          </p>
          <p className="mt-2 text-xs text-slate-600">
            Owner: {plan.checkpoint.owner}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {plan.checkpoint.successMetric}
          </p>
          <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">
              {plan.checkpoint.impact}
          </p>
        </section>
      )}
      {!saved && (
        <div className="border-t border-slate-200 pt-5">
          <div
            className="flex flex-wrap gap-3"
            aria-busy={state.confirmation !== null}
          >
            <button
              type="button"
              disabled={!canConfirm}
              onClick={(): void => {
                void onConfirm('accept');
              }}
              className="button-primary flex-1"
            >
              {state.confirmation === 'accept' ? 'Saving…' : 'Confirm Plan'}
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={(): void => {
                void onConfirm('decline');
              }}
              className="button-secondary flex-1"
            >
              {state.confirmation === 'decline' ? 'Updating…' : 'Not Now'}
            </button>
          </div>
          {state.error && (
            <p role="alert" className="mt-3 text-sm leading-6 text-amber-900">
              Save was not confirmed. {state.error}
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {!state.active
              ? 'This call has ended. Start a new call to agree on a plan.'
              : busy
                ? 'Wait for your KAM to finish before confirming.'
                : 'This saves your commitment in the demo only. It does not update Snapdeal.'}
          </p>
        </div>
      )}
    </div>
  );
}
