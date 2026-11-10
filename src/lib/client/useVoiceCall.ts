'use client';

import { useEffect, useReducer, useRef } from 'react';
import type { ClipBundle } from '@/lib/voice/clips';
import { clipBundleSchema } from '@/lib/voice/clips';
import { withAccess } from '@/lib/client/access';
import { createBrowserAudio } from '@/lib/client/browser-audio';
import { VoiceCallController } from '@/lib/client/voice-call';
import { appReducer, initialAppState } from '@/lib/client/app-state';
import type { AppState } from '@/lib/client/app-state';
import type { AgentState } from '@/lib/agent/contracts';
import { postEchoTurn } from '@/lib/client/sse';
import { waitForRetry } from '@/lib/voice/abort';
import { CALL_SETTINGS } from '@/lib/client/vad-settings';
import {
  confirmVoicePlan,
  endVoiceSession,
  openVoiceSession,
  readCommittedPlan,
} from '@/lib/client/session-api';

export interface VoiceCall extends AppState {
  setBargeIn: (enabled: boolean) => void;
  startCall: () => Promise<void>;
  endCall: () => void;
  sendText: (text: string) => Promise<boolean>;
  confirmPlan: (decision: 'accept' | 'decline') => Promise<void>;
}

export function useVoiceCall(): VoiceCall {
  const [state, dispatch] = useReducer(appReducer, undefined, initialAppState);
  const reference = useRef<VoiceCallController | null>(null);
  const ledger = useRef<AbortController | null>(null);
  const ledgerKey = useRef<string | null>(null);
  const sessionId = useRef<string | null>(null);
  const active = useRef(false);
  const loadCommitted = (agent: AgentState): void => {
    const id = sessionId.current;
    const planId = agent.plan?.id;
    if (
      !agent.committed ||
      !id ||
      !planId ||
      ledgerKey.current === `${id}:${planId}`
    )
      return;
    ledgerKey.current = `${id}:${planId}`;
    ledger.current?.abort();
    const abort = new AbortController();
    ledger.current = abort;
    dispatch({ type: 'ledger:loading', sessionId: id });
    void readCommittedPlan(planId, abort.signal)
      .then((record) => {
        if (!abort.signal.aborted)
          dispatch({ type: 'ledger', sessionId: id, record });
      })
      .catch(() => {
        if (!abort.signal.aborted)
          dispatch({ type: 'ledger:error', sessionId: id });
      });
  };
  const controller = (): VoiceCallController => {
    reference.current ??= new VoiceCallController(
      {
        createAudio: createBrowserAudio,
        reportFiller: (sessionId, turn): void => {
          void fetch('/api/metrics', {
            method: 'POST',
            headers: withAccess({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ sessionId, turn }),
          }).catch(() => undefined);
        },
        loadClips: async (): Promise<ClipBundle> =>
          clipBundleSchema.parse(
            await (
              await fetch('/api/clips', {
                headers: withAccess(),
                cache: 'no-store',
              })
            ).json(),
          ),
        createId: (): string => crypto.randomUUID(),
        now: (): number => performance.now(),
        send: postEchoTurn,
        openSession: openVoiceSession,
        endSession: endVoiceSession,
        confirmPlan: confirmVoicePlan,
        cooldown: (signal): Promise<void> =>
          waitForRetry(CALL_SETTINGS.echoTailMs, signal),
        observe: {
          session: (session): void => {
            sessionId.current = session.sessionId;
            dispatch({ type: 'session', session });
          },
          turn: (prefix): void => {
            dispatch({ type: 'turn', prefix });
          },
          event: (prefix, event): void => {
            dispatch({ type: 'event', prefix, event });
            if (event.event === 'state') loadCommitted(event.data);
          },
          error: (code): void => {
            dispatch({ type: 'error', code });
          },
          confirmation: (decision, status, result): void => {
            dispatch({
              type: 'confirmation',
              decision,
              status,
              ...(result ? { state: result } : {}),
            });
            if (result) loadCommitted(result);
          },
        },
      },
      (voice): void => {
        if (voice.active && !active.current) {
          ledger.current?.abort();
          ledgerKey.current = null;
        }
        active.current = voice.active;
        dispatch({ type: 'voice', state: voice });
      },
    );
    return reference.current;
  };
  useEffect(
    () => (): void => {
      const active = reference.current;
      reference.current = null;
      ledger.current?.abort();
      void active?.dispose();
    },
    [],
  );
  return {
    ...state,
    setBargeIn: (enabled): void => {
      controller().setBargeIn(enabled);
    },
    startCall: (): Promise<void> => controller().startCall(),
    endCall: (): void => {
      reference.current?.endCall();
    },
    sendText: async (text): Promise<boolean> => {
      const active = controller();
      await active.sendText(text);
      return active.snapshot().error === null;
    },
    confirmPlan: (decision): Promise<void> =>
      controller().confirmPlan(decision),
  };
}
