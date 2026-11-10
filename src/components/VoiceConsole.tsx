'use client';

import { useEffect, useRef, useState } from 'react';
import type { SyntheticEvent, ReactNode } from 'react';
import { useVoiceCall } from '@/lib/client/useVoiceCall';
import { VOICE_LIMITS } from '@/lib/voice/limits';
import { VoiceDebug } from '@/components/VoiceDebug';

const LABELS = {
  idle: 'Ready to start',
  listening: 'Listening',
  processing: 'Processing',
  speaking: 'Speaking',
} as const;

export function VoiceConsole({
  debug = false,
}: {
  debug?: boolean;
}): ReactNode {
  const voice = useVoiceCall();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const busy =
    voice.initializing ||
    voice.phase === 'processing' ||
    voice.phase === 'speaking';
  const label =
    voice.initializing && voice.phase !== 'speaking'
      ? 'Starting call'
      : voice.phase === 'listening' && voice.textFallback
        ? 'Ready for text'
        : LABELS[voice.phase];
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [voice.messages]);
  const submit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (await voice.sendText(text)) setText('');
  };
  return (
    <div className="space-y-5">
      <section
        aria-label="Voice call"
        className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="flex flex-col items-center gap-5 py-4">
          <div
            aria-hidden="true"
            data-phase={voice.phase}
            className="voice-orb flex h-24 w-24 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/50"
          >
            <span className="h-10 w-10 rounded-full bg-red-600" />
          </div>
          <p role="status" aria-live="polite" className="text-lg font-medium">
            {label}
          </p>
          <p className="max-w-md text-center text-sm leading-relaxed text-stone-600">
            {voice.active
              ? voice.textFallback
                ? 'Type below and your Virtual KAM will speak back.'
                : 'Speak naturally, then pause. The microphone waits while your Virtual KAM speaks.'
              : 'Call to try the microphone, or type a message below.'}
          </p>
          {voice.active ? (
            <button
              type="button"
              onClick={voice.endCall}
              className="rounded-full border border-red-300 px-8 py-3 font-semibold text-red-700 hover:bg-red-50"
            >
              End Call
            </button>
          ) : (
            <button
              type="button"
              onClick={(): void => {
                void voice.startCall();
              }}
              className="rounded-full bg-red-700 px-10 py-3 font-semibold text-white hover:bg-red-800"
            >
              {voice.agent?.phase === 'done' ? 'Call again' : 'Call'}
            </button>
          )}
        </div>
        {voice.error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950"
          >
            {voice.error}
          </p>
        )}
        {voice.notice && (
          <p role="status" className="mt-4 text-sm text-stone-600">
            {voice.notice}
          </p>
        )}
        {voice.agent && (
          <p className="mt-4 text-center text-sm text-stone-600">
            {voice.agent.committed
              ? 'Saved to demo ledger — not sent to Snapdeal.'
              : `Conversation: ${voice.agent.phase}`}{' '}
            {voice.maxQuestions !== null && !voice.agent.committed
              ? `· Questions ${String(voice.agent.questionsAsked)} of ${String(voice.maxQuestions)}`
              : ''}
          </p>
        )}
        {voice.phase === 'processing' && voice.tools.at(-1) && (
          <p role="status" className="mt-3 text-center text-sm text-stone-600">
            {voice.tools.at(-1)}
          </p>
        )}
      </section>
      <section
        aria-labelledby="transcript-title"
        className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6"
      >
        <h2 id="transcript-title" className="font-semibold">
          Conversation
        </h2>
        <div
          role="log"
          aria-label="Call transcript"
          aria-live="polite"
          aria-relevant="additions text"
          className="mt-4 max-h-80 space-y-3 overflow-y-auto"
        >
          {voice.messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">
              Your conversation with the Virtual KAM will appear here.
            </p>
          ) : (
            voice.messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[95%] rounded-2xl px-4 py-3 text-sm sm:max-w-[85%] ${message.role === 'seller' ? 'ml-auto bg-stone-100' : 'bg-red-50'}`}
              >
                <p className="mb-1 text-xs font-semibold text-stone-600">
                  {message.role === 'seller' ? 'You' : 'Virtual KAM'}
                </p>
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {message.text}
                </p>
              </div>
            ))
          )}
          <div ref={end} />
        </div>
        {voice.agent?.phase === 'confirm' && voice.agent.plan && (
          <div
            className="mt-5 flex flex-wrap gap-3"
            aria-label="Confirm spoken plan"
          >
            <button
              type="button"
              disabled={busy}
              onClick={(): void => {
                void voice.confirmPlan('accept');
              }}
              className="rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Save this spoken plan
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(): void => {
                void voice.confirmPlan('decline');
              }}
              className="rounded-xl border border-stone-300 px-5 py-3 text-sm font-semibold disabled:opacity-40"
            >
              Not now
            </button>
          </div>
        )}
        <form
          onSubmit={(event): void => {
            void submit(event);
          }}
          className="mt-5 border-t border-stone-200 pt-5"
        >
          <label htmlFor="voice-message" className="block text-sm font-medium">
            Can’t use the microphone? Type a message
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="voice-message"
              value={text}
              onChange={(event): void => {
                setText(event.target.value);
              }}
              maxLength={VOICE_LIMITS.textChars}
              autoComplete="off"
              placeholder="Tell me about your sales…"
              className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="rounded-xl bg-stone-900 px-6 py-3 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>
      </section>
      {debug && <VoiceDebug state={voice} />}
    </div>
  );
}
