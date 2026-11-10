'use client';
import { useEffect, useRef, useState } from 'react';
import type { SyntheticEvent, ReactNode } from 'react';
import type { VoiceCall } from '@/lib/client/useVoiceCall';
import { VOICE_LIMITS } from '@/lib/voice/limits';
const LABELS = {
  idle: 'Ready to start',
  listening: 'Listening',
  processing: 'Checking the evidence',
  speaking: 'Speaking',
} as const;
export function VoiceConsole({
  voice,
  onReviewPlan,
}: {
  voice: VoiceCall;
  onReviewPlan: () => void;
}): ReactNode {
  const [text, setText] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const busy =
    voice.initializing ||
    voice.phase === 'processing' ||
    voice.phase === 'speaking';
  const label =
    !voice.active && voice.agent?.phase === 'done'
      ? 'Call complete'
      : voice.initializing && voice.phase !== 'speaking'
        ? 'Opening your session'
        : voice.phase === 'listening' && voice.textFallback
          ? 'Ready for text'
          : LABELS[voice.phase];
  useEffect(() => {
    const region = log.current;
    if (region) region.scrollTop = region.scrollHeight;
  }, [voice.messages]);
  const submit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (await voice.sendText(text)) setText('');
  };
  return (
    <section className="panel min-w-0" aria-label="Voice console">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
        <h2 className="text-sm font-semibold text-slate-800">
          Your Virtual KAM
        </h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${voice.active ? 'bg-red-600' : 'bg-slate-400'}`}
          />
          {voice.active ? 'Session active' : 'Voice-first support'}
        </span>
      </div>
      <div className="px-5 pt-7 pb-5 sm:px-6">
        <div className="flex flex-col items-center">
          <div
            aria-hidden="true"
            data-phase={voice.phase}
            className="voice-orb flex h-24 w-24 items-center justify-center rounded-full border border-red-100 bg-red-50 ring-8 ring-red-50/50"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-700 text-white shadow-sm">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
              </svg>
            </div>
          </div>
          <p
            role="status"
            aria-live="polite"
            className="mt-6 text-lg font-semibold text-slate-900"
          >
            {label}
          </p>
          <p className="mt-2 max-w-xs text-center text-xs leading-5 text-slate-500">
            {voice.active
              ? voice.textFallback
                ? 'Type below. Your KAM will speak the reply.'
                : 'Speak naturally, then pause. Your microphone waits while your KAM speaks.'
              : 'Start with your concern. Your KAM will check the numbers with you.'}
          </p>
        </div>
        <div className="mt-5">
          {voice.active ? (
            <button
              type="button"
              onClick={voice.endCall}
              className="button-secondary w-full border-red-200 text-red-800"
            >
              End Call
            </button>
          ) : (
            <button
              type="button"
              onClick={(): void => {
                void voice.startCall();
              }}
              className="button-primary w-full"
            >
              {voice.agent?.committed
                ? 'Call Virtual KAM again'
                : 'Call Virtual KAM'}
            </button>
          )}
        </div>
        {voice.agent && (
          <p className="mt-3 text-center text-xs capitalize text-slate-500">
            Conversation: {voice.agent.phase}
          </p>
        )}
        {voice.phase === 'processing' && voice.tools.at(-1) && (
          <p role="status" className="mt-3 text-center text-xs text-slate-600">
            {voice.tools.at(-1)}
          </p>
        )}
        {voice.error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"
          >
            {voice.error}
          </p>
        )}
        {voice.notice && (
          <p role="status" className="mt-3 text-xs leading-5 text-slate-600">
            {voice.notice}
          </p>
        )}
        {(voice.agent?.plan || voice.agent?.committed) && (
          <button
            type="button"
            onClick={onReviewPlan}
            className="mt-4 w-full rounded-lg border border-red-100 bg-red-50 px-3 py-3 text-left text-xs font-medium leading-5 text-red-900"
          >
            {voice.agent.committed
              ? 'Saved to demo ledger — not sent to Snapdeal. View your plan →'
              : 'Your plan is ready. Review the Recovery Plan tab →'}
          </button>
        )}
      </div>
      <div className="border-t border-slate-100 px-5 pt-4 pb-5 sm:px-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700">Conversation</h3>
          <span className="text-[11px] text-slate-500">You + Virtual KAM</span>
        </div>
        <div
          ref={log}
          role="log"
          aria-label="Call transcript"
          aria-live="polite"
          aria-relevant="additions text"
          className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1"
        >
          {voice.messages.length === 0 ? (
            <div className="py-6 text-center text-xs leading-6 text-slate-500">
              <p>The conversation will appear here.</p>
              <p className="mt-1 text-slate-500">
                Try “My sales have dropped this month.”
              </p>
            </div>
          ) : (
            voice.messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[94%] rounded-xl px-3.5 py-3 text-xs ${message.role === 'seller' ? 'ml-auto bg-slate-100' : 'border border-red-100/70 bg-red-50/60'}`}
              >
                <p className="mb-1 text-[11px] font-semibold text-slate-500">
                  {message.role === 'seller' ? 'You' : 'Virtual KAM'}
                </p>
                <p className="whitespace-pre-wrap break-words leading-6 text-slate-800">
                  {message.text}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
      <details
        className="border-t border-slate-100 px-5 py-4 sm:px-6"
        open={voice.textFallback}
      >
        <summary className="cursor-pointer text-xs font-medium text-slate-600">
          Can’t use the microphone?
        </summary>
        <form
          onSubmit={(event): void => {
            void submit(event);
          }}
          className="mt-4"
        >
          <label
            htmlFor="voice-message"
            className="block text-xs text-slate-600"
          >
            Type a message to your KAM
          </label>
          <div className="mt-2 flex min-w-0 gap-2">
            <input
              id="voice-message"
              value={text}
              onChange={(event): void => {
                setText(event.target.value);
              }}
              maxLength={VOICE_LIMITS.textChars}
              autoComplete="off"
              placeholder="Tell me about your sales…"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}
