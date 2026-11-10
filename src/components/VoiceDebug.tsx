import type { ReactNode } from 'react';
import type { VoiceState } from '@/lib/client/voice-state';

function milliseconds(value: number | null | undefined): string {
  return value === undefined || value === null
    ? '—'
    : `${Math.round(value).toLocaleString('en-IN')} ms`;
}

export function VoiceDebug({ state }: { state: VoiceState }): ReactNode {
  const samples = state.measurements
    .filter(
      (entry) =>
        entry.source === 'voice' &&
        !entry.failed &&
        entry.firstAudioMs !== null,
    )
    .map((entry) => entry.firstAudioMs)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const middle = Math.floor(samples.length / 2);
  const median =
    samples.length === 0
      ? null
      : samples.length % 2 === 1
        ? samples[middle]
        : ((samples[middle - 1] ?? 0) + (samples[middle] ?? 0)) / 2;
  return (
    <aside
      aria-label="Voice timing debug"
      className="rounded-2xl border border-stone-300 bg-stone-950 p-5 text-sm text-stone-100"
    >
      <h2 className="font-semibold">Voice timing</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-stone-400">First audio</dt>
          <dd>{milliseconds(state.firstAudioMs)}</dd>
        </div>
        <div>
          <dt className="text-stone-400">STT</dt>
          <dd>{milliseconds(state.serverTimings?.sttMs)}</dd>
        </div>
        <div>
          <dt className="text-stone-400">First TTS</dt>
          <dd>{milliseconds(state.serverTimings?.ttsFirstMs)}</dd>
        </div>
        <div>
          <dt className="text-stone-400">Server total</dt>
          <dd>{milliseconds(state.serverTimings?.totalMs)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-stone-400">
        Voice timing starts at the last VAD speech frame and ends at scheduled
        Web Audio playback. Text timing starts at Send. Device output latency is
        not measured.
      </p>
      {state.measurements.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="mb-2 text-left text-stone-400">
              Recent turns · voice p50 {milliseconds(median)}
            </caption>
            <thead>
              <tr>
                <th className="py-2">Turn</th>
                <th>Input</th>
                <th>First audio</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.measurements.map((entry) => (
                <tr key={entry.turn} className="border-t border-stone-700">
                  <td className="py-2">{entry.turn}</td>
                  <td>{entry.source}</td>
                  <td>{milliseconds(entry.firstAudioMs)}</td>
                  <td>{entry.failed ? 'Failed' : 'Completed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}
