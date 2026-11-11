'use client';
import { useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { AppState } from '@/lib/client/app-state';
import type { DashboardReference } from '@/lib/client/dashboard-contracts';
import { SnapshotPanel } from '@/components/SnapshotPanel';
import { DiagnosisPanel } from '@/components/DiagnosisPanel';
import { PlanPanel } from '@/components/PlanPanel';
export type DashboardTab = 'snapshot' | 'diagnosis' | 'plan';
const TABS = [
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'diagnosis', label: 'Diagnosis' },
  { id: 'plan', label: 'Recovery Plan' },
] as const;
export function DashboardTabs({
  state,
  reference,
  onConfirm,
  onFollowup,
  selected,
  onSelect,
}: {
  state: AppState;
  reference: DashboardReference | null;
  onConfirm: (decision: 'accept' | 'decline') => Promise<void>;
  onFollowup?: (planId: string) => Promise<void>;
  selected?: DashboardTab;
  onSelect?: (tab: DashboardTab) => void;
}): ReactNode {
  const [local, setLocal] = useState<DashboardTab>('snapshot');
  const tab = selected ?? local;
  const controls = useRef<Partial<Record<DashboardTab, HTMLButtonElement>>>({});
  const select = (id: DashboardTab): void => {
    setLocal(id);
    onSelect?.(id);
  };
  const keydown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? TABS.length - 1
          : event.key === 'ArrowRight'
            ? (index + 1) % TABS.length
            : event.key === 'ArrowLeft'
              ? (index + TABS.length - 1) % TABS.length
              : null;
    const target = next === null ? undefined : TABS[next];
    if (!target) return;
    event.preventDefault();
    select(target.id);
    controls.current[target.id]?.focus();
  };
  return (
    <section
      className="panel min-w-0 self-start"
      aria-label="Seller business insights"
    >
      <div
        role="tablist"
        aria-label="Business insight panels"
        className="flex border-b border-slate-200 px-2 sm:px-4"
      >
        {TABS.map((item, index) => (
          <button
            key={item.id}
            ref={(element): void => {
              if (element) controls.current[item.id] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={(): void => {
              select(item.id);
            }}
            onKeyDown={(event): void => {
              keydown(event, index);
            }}
            className={`relative flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2 border-b-2 px-1 text-xs font-semibold sm:px-3 sm:text-sm ${tab === item.id ? 'border-red-700 text-red-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {item.label}
            {item.id === 'plan' &&
              state.agent?.plan &&
              !state.agent.committed && (
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-red-600"
                />
              )}
          </button>
        ))}
      </div>
      <div
        id="panel-snapshot"
        role="tabpanel"
        aria-labelledby="tab-snapshot"
        tabIndex={0}
        hidden={tab !== 'snapshot'}
      >
        {state.agent?.followup && (
          <p className="px-5 pt-4 text-xs text-slate-500">
            Original monthly snapshot. The simulated seven-day figures are in
            Recovery Plan.
          </p>
        )}
        <SnapshotPanel
          snapshot={state.snapshot}
          reference={reference}
          loading={state.initializing}
          error={state.snapshotError}
        />
      </div>
      <div
        id="panel-diagnosis"
        role="tabpanel"
        aria-labelledby="tab-diagnosis"
        tabIndex={0}
        hidden={tab !== 'diagnosis'}
      >
        <DiagnosisPanel state={state} reference={reference} />
      </div>
      <div
        id="panel-plan"
        role="tabpanel"
        aria-labelledby="tab-plan"
        tabIndex={0}
        hidden={tab !== 'plan'}
      >
        <PlanPanel
          state={state}
          onConfirm={onConfirm}
          {...(onFollowup ? { onFollowup } : {})}
        />
      </div>
    </section>
  );
}
