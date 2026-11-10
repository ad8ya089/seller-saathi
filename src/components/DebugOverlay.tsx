'use client';
import { useEffect, useState } from 'react';
import { operationalTurnSchema } from '@/lib/voice/operational-metrics';
import type { OperationalTurn } from '@/lib/voice/operational-metrics';
import { withAccess } from '@/lib/client/access';
import type { ReactNode } from 'react';
import type { AppState } from '@/lib/client/app-state';
import { VoiceDebug } from '@/components/VoiceDebug';
import { number } from '@/lib/client/format';
import { questionProgress } from '@/lib/client/dashboard-view';
export function DebugOverlay({ state }: { state: AppState }): ReactNode {
  const [operational, setOperational] = useState<OperationalTurn | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    const sessionId = state.sessionId;
    if (sessionId && state.currentTurn)
      void fetch(`/api/metrics?sessionId=${sessionId}`, {
        headers: withAccess(),
        cache: 'no-store',
        signal: abort.signal,
      })
        .then(async (response) => {
          const result = operationalTurnSchema
            .nullable()
            .safeParse(await response.json());
          if (!abort.signal.aborted)
            setOperational(result.success ? result.data : null);
        })
        .catch(() => undefined);
    return (): void => {
      abort.abort();
    };
  }, [state.sessionId, state.currentTurn]);
  const observed =
    operational?.sessionId === state.sessionId ? operational : null;
  const questions = questionProgress(state);
  const names = [...new Set(state.toolActivity.map((item) => item.name))];
  return (
    <section
      aria-label="Session debug"
      className="mt-6 space-y-3 rounded-2xl border border-slate-300 bg-slate-950 p-4 text-sm text-slate-100 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Session debug</h2>
        <span className="text-xs text-slate-400">Observed values only</span>
      </div>
      <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-slate-400">Conversation phase</dt>
          <dd className="mt-1">{state.agent?.phase ?? 'Not available'}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Last completed turn</dt>
          <dd className="mt-1">{number(state.currentTurn)}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Questions used</dt>
          <dd className="mt-1">
            {number(questions.used)} / {number(questions.max)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Token usage</dt>
          <dd className="mt-1">
            {observed && observed.metrics.usageComplete !== false
              ? `${number(observed.metrics.tokens.input)} in / ${number(observed.metrics.tokens.output + observed.metrics.tokens.thoughts)} out`
              : 'Not available'}
          </dd>
        </div>
      </dl>
      <p className="text-xs leading-5 text-slate-400">
        Usage comes from completed server turns when available. Estimated
        session cost: Not available; failed-attempt usage and exchange rate are
        incomplete.
      </p>
      <VoiceDebug state={state} />
      <p className="break-words text-xs leading-6 text-slate-400">
        <span className="font-medium text-slate-300">Tools: </span>
        {names.length ? names.join(' · ') : 'Not available'}
      </p>
    </section>
  );
}
