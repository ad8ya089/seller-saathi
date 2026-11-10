'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserAudio } from '@/lib/client/browser-audio';
import { VoiceCallController } from '@/lib/client/voice-call';
import { initialVoiceState } from '@/lib/client/voice-state';
import type { VoiceState } from '@/lib/client/voice-state';
import { postEchoTurn } from '@/lib/client/sse';
import { waitForRetry } from '@/lib/voice/abort';
import { CALL_SETTINGS } from '@/lib/client/vad-settings';

interface VoiceCall extends VoiceState {
  startCall: () => Promise<void>;
  endCall: () => void;
  sendText: (text: string) => Promise<boolean>;
}

export function useVoiceCall(): VoiceCall {
  const [state, setState] = useState(initialVoiceState);
  const reference = useRef<VoiceCallController | null>(null);
  const controller = (): VoiceCallController => {
    reference.current ??= new VoiceCallController(
      {
        createAudio: createBrowserAudio,
        createId: (): string => crypto.randomUUID(),
        now: (): number => performance.now(),
        send: postEchoTurn,
        cooldown: (signal): Promise<void> =>
          waitForRetry(CALL_SETTINGS.echoTailMs, signal),
      },
      setState,
    );
    return reference.current;
  };
  useEffect(
    () => (): void => {
      const active = reference.current;
      reference.current = null;
      void active?.dispose();
    },
    [],
  );
  return {
    ...state,
    startCall: (): Promise<void> => controller().startCall(),
    endCall: (): void => {
      reference.current?.endCall();
    },
    sendText: async (text): Promise<boolean> => {
      const active = controller();
      await active.sendText(text);
      return active.snapshot().error === null;
    },
  };
}
