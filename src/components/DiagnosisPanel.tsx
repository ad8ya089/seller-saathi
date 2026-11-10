import type { ReactNode } from 'react';
import type { AppState } from '@/lib/client/app-state';
import type { DashboardReference } from '@/lib/client/dashboard-contracts';
import {
  FACT_NAMES,
  HYPOTHESIS_NAMES,
  hypothesisEvidence,
  questionProgress,
  scoreGeometry,
} from '@/lib/client/dashboard-view';
import { number } from '@/lib/client/format';

export function DiagnosisPanel({
  state,
  reference,
}: {
  state: AppState;
  reference: DashboardReference | null;
}): ReactNode {
  const ranking = state.agent?.hypotheses ?? state.snapshot?.hypotheses ?? [];
  if (!state.snapshot && !ranking.length)
    return (
      <div className="panel-empty">
        <span className="eyebrow">Diagnosis</span>
        <h2 className="mt-3 text-xl font-semibold">Evidence before advice</h2>
        <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
          Start a session to see working hypotheses. As your KAM checks the
          numbers and records your answers, the evidence and rankings will
          update here.
        </p>
      </div>
    );
  const progress = questionProgress(state);
  const geometry = scoreGeometry(ranking.map((item) => item.score));
  const question =
    state.currentQuestion ??
    (!state.agent && state.snapshot?.suggestedNextQuestion
      ? reference?.questions[state.snapshot.suggestedNextQuestion]
      : null);
  return (
    <div className="space-y-6 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Evidence-led diagnosis</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            Working hypotheses
          </h2>
        </div>
        <span className="badge-neutral">
          {number(progress.used)} / {number(progress.max)} questions
        </span>
      </header>
      <p className="text-sm leading-6 text-slate-600">
        These are possible explanations, not proven facts. Scores reflect the
        demo’s evidence rules; confidence is not a probability.
      </p>
      <div className="space-y-3" aria-label="Ranked hypotheses">
        {ranking.map((hypothesis, index) => {
          const evidence = hypothesisEvidence(state, reference, hypothesis.id);
          const bar = geometry.bars[index];
          return (
            <article
              key={hypothesis.id}
              className={`rounded-xl border p-4 ${index === 0 ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white'}`}
              aria-label={`${HYPOTHESIS_NAMES[hypothesis.id]} hypothesis`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">
                    {HYPOTHESIS_NAMES[hypothesis.id]}
                  </h3>
                  {index === 0 && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Leading hypothesis
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">
                    <span className="text-xs font-normal text-slate-500">
                      Score{' '}
                    </span>
                    {number(hypothesis.score)}
                  </span>
                  <span className={`confidence confidence-${hypothesis.level}`}>
                    {hypothesis.level.charAt(0).toUpperCase() +
                      hypothesis.level.slice(1)}
                  </span>
                </div>
              </div>
              <div
                aria-hidden="true"
                className="relative mt-3 h-1.5 rounded-full bg-slate-100"
              >
                <span
                  className={`absolute inset-y-0 rounded-full ${hypothesis.score < 0 ? 'bg-slate-500' : 'bg-red-600'}`}
                  style={{
                    left: `${String(bar?.left ?? 0)}%`,
                    width: `${String(bar?.width ?? 0)}%`,
                  }}
                />
              </div>
              <details className="mt-3" open={index === 0}>
                <summary className="cursor-pointer text-xs font-medium text-slate-600">
                  Evidence contributing to this score
                </summary>
                <ul className="mt-3 space-y-3">
                  {evidence.map((item) => (
                    <li key={item.key} className="text-xs leading-5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`source-label ${item.source === 'Seller said' ? 'source-seller' : ''}`}
                        >
                          {item.source}
                        </span>
                        <span className="tabular-nums text-slate-500">
                          Score {item.contribution}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-700">
                        {item.source === 'Seller said'
                          ? `“${item.text}”`
                          : item.text}
                      </p>
                    </li>
                  ))}
                </ul>
                {!evidence.length && (
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Contributing evidence is not available in the current view.
                  </p>
                )}
              </details>
            </article>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Bars use the observed score range, {number(geometry.min)} to{' '}
        {number(geometry.max)}. Negative evidence can lower a score. Detail
        evidence appears when the server completes the findings checks.
      </p>
      <section
        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
        aria-label="Current investigation question"
      >
        <div className="flex flex-wrap justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {state.currentQuestion
              ? 'Current question'
              : 'Suggested next question'}
          </h3>
          <span className="text-xs text-slate-500">
            {number(progress.remaining)} remaining
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {question ?? 'Your KAM will ask the next question when ready.'}
        </p>
      </section>
      {(state.agent?.facts.length ?? 0) > 0 && (
        <section aria-label="Seller statements">
          <h3 className="text-sm font-semibold">What you told your KAM</h3>
          <ul className="mt-3 space-y-3">
            {state.agent?.facts.map((fact) => (
              <li
                key={fact.factId}
                className="rounded-xl border border-slate-200 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">
                    {FACT_NAMES[fact.factId]}:{' '}
                    {typeof fact.value === 'number'
                      ? `${number(fact.value)} days`
                      : fact.value.replaceAll('_', ' ')}
                  </span>
                  <span className="source-label source-seller">
                    Seller said · turn {number(fact.turn)}
                  </span>
                </div>
                <blockquote className="mt-2 leading-5 text-slate-600">
                  “{fact.quote}”
                </blockquote>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Tool activity timeline">
        <h3 className="text-sm font-semibold">Live activity</h3>
        {state.toolActivity.length ? (
          <ol className="mt-3 max-h-48 space-y-3 overflow-y-auto pr-1">
            {state.toolActivity.map((item) => (
              <li
                key={item.id}
                className="flex gap-3 text-xs leading-5 text-slate-600"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
                />
                {item.label}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Tool activity will appear as your KAM checks the data.
          </p>
        )}
      </section>
    </div>
  );
}
