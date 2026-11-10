import { VoiceCallController } from '@/lib/client/voice-call';
import { createBrowserAudio } from '@/lib/client/browser-audio';
import { abortable } from '@/lib/voice/abort';
import type {
  MicrophoneCallbacks,
  MicrophoneHandle,
  VoiceDependencies,
} from '@/lib/client/voice-state';
import type { EchoSubmission } from '@/lib/client/sse';

export async function interruptInChrome(
  wav: string,
  greeting: string,
  completedFirst = false,
): Promise<{
  stopMs: number;
  aborted: boolean;
  played: number | undefined;
  submissions: number;
}> {
  const audio = createBrowserAudio();
  let callbacks: MicrophoneCallbacks | undefined;
  let active: AbortSignal | undefined;
  let submitted: EchoSubmission | undefined;
  let submissions = 0;
  audio.openMicrophone = (handlers): Promise<MicrophoneHandle> => {
    callbacks = handlers;
    return Promise.resolve({
      start: () => Promise.resolve(),
      pause: () => Promise.resolve(),
      destroy: () => Promise.resolve(),
    });
  };
  const deps: VoiceDependencies = {
    createAudio: () => audio,
    createId: () => crypto.randomUUID(),
    now: () => performance.now(),
    cooldown: () => Promise.resolve(),
    endSession: () => Promise.resolve(),
    confirmPlan: () => Promise.reject(new Error('unused')),
    openSession: () =>
      Promise.resolve({
        sessionId: crypto.randomUUID(),
        greeting: {
          text: 'Hello, I am an AI assistant.',
          audioB64: greeting,
          mime: 'audio/wav',
        },
        snapshot: {},
        config: { maxUtteranceMs: 28000, maxQuestions: 3, bargeIn: true },
      }),
    send: async (input, emit, signal): Promise<void> => {
      submissions += 1;
      if (submissions > 1) {
        submitted = input;
        return;
      }
      active = signal;
      await emit({
        event: 'transcript',
        data: { text: 'Sales dropped', sttMs: 1 },
      });
      await emit({
        event: 'sentence',
        data: { idx: 0, text: 'Let us check the stock.' },
      });
      await emit({
        event: 'audio',
        data: {
          idx: 0,
          mime: 'audio/wav',
          b64: completedFirst ? greeting : wav,
        },
      });
      if (completedFirst) {
        await emit({
          event: 'sentence',
          data: { idx: 1, text: 'Here is the next sentence.' },
        });
        await emit({
          event: 'audio',
          data: { idx: 1, mime: 'audio/wav', b64: wav },
        });
      }
      await abortable(new Promise<void>(() => undefined), signal);
    },
  };
  const controller = new VoiceCallController(deps, () => undefined);
  await controller.startCall();
  const reply = controller.sendText('Sales dropped');
  while (controller.snapshot().phase !== 'speaking')
    await new Promise((resolve) => setTimeout(resolve, 10));
  await new Promise((resolve) =>
    setTimeout(resolve, completedFirst ? 350 : 100),
  );
  const started = performance.now();
  callbacks?.onSpeechStart();
  const stopMs = performance.now() - started;
  await reply;
  callbacks?.onSpeechEnd(new Float32Array(1600));
  callbacks?.onSpeechEnd(new Float32Array(1600));
  await new Promise((resolve) => setTimeout(resolve, 50));
  await controller.dispose();
  return {
    stopMs,
    aborted: active?.aborted ?? false,
    played: submitted?.playedSentences,
    submissions,
  };
}
