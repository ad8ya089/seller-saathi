import { describe, expect, it, vi } from 'vitest';
import { VoiceCallController } from '@/lib/client/voice-call';
import { AudioQueue } from '@/lib/client/audio-queue';
import type { DecodedClip } from '@/lib/client/audio-queue';
import type {
  AudioResources,
  MicrophoneCallbacks,
  MicrophoneHandle,
  VoiceDependencies,
} from '@/lib/client/voice-state';
import type { EchoEvent } from '@/lib/voice/events';
import { AppError } from '@/lib/errors';
import { CALL_SETTINGS } from '@/lib/client/vad-settings';
import { wavFixture } from '../voice/fixtures';

function rig(): {
  controller: VoiceCallController;
  deps: VoiceDependencies;
  audio: AudioResources;
  capture: MicrophoneHandle;
  callbacks: () => MicrophoneCallbacks;
  phases: string[];
  ended: (() => void)[];
} {
  let handlers: MicrophoneCallbacks | undefined;
  const ended: (() => void)[] = [];
  const phases: string[] = [];
  const capture: MicrophoneHandle = {
    pause: vi.fn<MicrophoneHandle['pause']>().mockResolvedValue(undefined),
    start: vi.fn<MicrophoneHandle['start']>().mockResolvedValue(undefined),
    destroy: vi.fn<MicrophoneHandle['destroy']>().mockResolvedValue(undefined),
  };
  const audio: AudioResources = {
    createQueue: (): AudioQueue =>
      new AudioQueue({
        now: (): number => 0,
        decode: (): Promise<DecodedClip> =>
          Promise.resolve({
            duration: 0.1,
            play: (_when, done): { stop: () => void } => {
              ended.push(done);
              return { stop: vi.fn<() => void>() };
            },
          }),
      }),
    resume: vi.fn<AudioResources['resume']>().mockResolvedValue(undefined),
    suspend: vi.fn<AudioResources['suspend']>().mockResolvedValue(undefined),
    close: vi.fn<AudioResources['close']>().mockResolvedValue(undefined),
    openMicrophone: (callbacks): Promise<MicrophoneHandle> => {
      handlers = callbacks;
      return Promise.resolve(capture);
    },
  };
  const deps: VoiceDependencies = {
    createAudio: vi
      .fn<VoiceDependencies['createAudio']>()
      .mockReturnValue(audio),
    createId: (): string => 'call-test',
    now: (): number => 1000,
    cooldown: (): Promise<void> => Promise.resolve(),
    send: vi.fn<VoiceDependencies['send']>().mockResolvedValue(undefined),
  };
  return {
    controller: new VoiceCallController(deps, (state): void => {
      phases.push(state.phase);
    }),
    deps,
    audio,
    capture,
    phases,
    ended,
    callbacks: (): MicrophoneCallbacks => {
      if (!handlers) throw new Error('Microphone not started');
      return handlers;
    },
  };
}
const wav = wavFixture({ sampleRate: 24000 }).toString('base64');
const echoEvents: EchoEvent[] = [
  { event: 'transcript', data: { text: 'Hello stock', sttMs: 3 } },
  { event: 'sentence', data: { idx: 0, text: 'You said: Hello stock' } },
  { event: 'audio', data: { idx: 0, mime: 'audio/wav', b64: wav } },
  {
    event: 'done',
    data: { timings: { sttMs: 3, ttsFirstMs: 2, totalMs: 6 }, turn: 1 },
  },
];

describe('voice call lifecycle', () => {
  it('does not create an AudioContext before a user starts a call', async () => {
    const { controller, deps, audio } = rig();
    expect(deps.createAudio).not.toHaveBeenCalled();
    await controller.startCall();
    expect(controller.snapshot()).toMatchObject({
      active: true,
      initializing: false,
      phase: 'listening',
    });
    expect(deps.createAudio).toHaveBeenCalledOnce();
    controller.endCall();
    await controller.startCall();
    expect(deps.createAudio).toHaveBeenCalledOnce();
    await controller.dispose();
    expect(audio.close).toHaveBeenCalledOnce();
  });
  it('pauses the microphone throughout processing and playback, then returns to listening', async () => {
    const { controller, deps, capture, ended, phases } = rig();
    deps.send = async (_input, onEvent): Promise<void> => {
      for (const event of echoEvents) await onEvent(event);
    };
    await controller.startCall();
    const turn = controller.submitAudio(new Float32Array(1600), 900);
    await vi.waitFor(() => {
      expect(ended).toHaveLength(1);
    });
    expect(controller.snapshot().phase).toBe('speaking');
    expect(capture.pause).toHaveBeenCalledOnce();
    expect(capture.start).not.toHaveBeenCalled();
    ended[0]?.();
    await turn;
    expect(phases).toContain('processing');
    expect(phases).toContain('speaking');
    expect(controller.snapshot().phase).toBe('listening');
    expect(capture.start).toHaveBeenCalledOnce();
    expect(
      controller.snapshot().messages.map((message) => message.text),
    ).toEqual(['Hello stock', 'You said: Hello stock']);
    await controller.dispose();
  });
  it('keeps text fallback active when microphone permission is denied', async () => {
    const { controller, deps, audio } = rig();
    audio.openMicrophone = (): Promise<MicrophoneHandle> =>
      Promise.reject(
        new AppError(
          'MICROPHONE_UNAVAILABLE',
          'Microphone permission denied. Use text input.',
        ),
      );
    await controller.startCall();
    expect(controller.snapshot()).toMatchObject({
      active: true,
      textFallback: true,
      phase: 'listening',
    });
    await controller.sendText('Hello');
    expect(deps.send).toHaveBeenCalledOnce();
    await controller.dispose();
  });
  it('supports text before a microphone call without asking for microphone permission', async () => {
    const { controller, audio } = rig();
    const open = vi.fn<AudioResources['openMicrophone']>();
    audio.openMicrophone = open;
    await controller.sendText('Hello');
    expect(open).not.toHaveBeenCalled();
    expect(controller.snapshot().textFallback).toBe(true);
    await controller.dispose();
  });
  it('cleans up when End Call happens while microphone initialization is pending', async () => {
    const { controller, audio, capture } = rig();
    let release: (value: MicrophoneHandle) => void = () => undefined;
    audio.openMicrophone = (): Promise<MicrophoneHandle> =>
      new Promise((resolve) => {
        release = resolve;
      });
    const start = controller.startCall();
    await Promise.resolve();
    controller.endCall();
    release(capture);
    await start;
    expect(capture.destroy).toHaveBeenCalledOnce();
    expect(controller.snapshot().phase).toBe('idle');
    await controller.dispose();
  });
  it('aborts an active turn and ignores late SSE after End Call', async () => {
    const { controller, deps } = rig();
    let release: () => void = () => undefined;
    let turnSignal: AbortSignal | undefined;
    deps.send = async (_input, onEvent, signal): Promise<void> => {
      turnSignal = signal;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await onEvent(
        echoEvents[0] ?? {
          event: 'error',
          data: { code: 'INTERNAL', message: 'error', retryable: true },
        },
      );
    };
    await controller.startCall();
    const turn = controller.sendText('Hello');
    await Promise.resolve();
    await Promise.resolve();
    controller.endCall();
    release();
    await turn;
    expect(turnSignal?.aborted).toBe(true);
    expect(controller.snapshot().messages).toEqual([]);
    expect(controller.snapshot().phase).toBe('idle');
    await controller.dispose();
  });
  it('does not submit two turns concurrently or capture the bot during playback', async () => {
    const { controller, deps, callbacks } = rig();
    let release: () => void = () => undefined;
    deps.send = vi.fn<VoiceDependencies['send']>().mockImplementation(
      (): Promise<void> =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await controller.startCall();
    const first = controller.sendText('Hello');
    await Promise.resolve();
    await Promise.resolve();
    await controller.sendText('duplicate');
    callbacks().onSpeechEnd(new Float32Array(1600));
    expect(deps.send).toHaveBeenCalledOnce();
    release();
    await first;
    await controller.dispose();
  });
  it('recovers from network/provider errors with a retry message and resumes listening', async () => {
    const { controller, deps, capture } = rig();
    deps.send = (): Promise<void> =>
      Promise.reject(new AppError('PROVIDER_TIMEOUT', 'Please retry.', true));
    await controller.startCall();
    await controller.sendText('Hello');
    expect(controller.snapshot()).toMatchObject({
      phase: 'listening',
      error: 'Please retry.',
    });
    expect(capture.start).toHaveBeenCalledOnce();
    await controller.dispose();
  });
  it('rejects invalid text/audio locally without submitting', async () => {
    const { controller, deps } = rig();
    await controller.sendText(' ');
    expect(deps.createAudio).not.toHaveBeenCalled();
    await controller.startCall();
    await controller.submitAudio(new Float32Array());
    expect(deps.send).not.toHaveBeenCalled();
    await controller.dispose();
  });
  it('ignores old microphone callbacks after a new call starts', async () => {
    const { controller, deps, callbacks } = rig();
    await controller.startCall();
    const old = callbacks();
    controller.endCall();
    await controller.startCall();
    old.onSpeechEnd(new Float32Array(1600));
    await Promise.resolve();
    expect(deps.send).not.toHaveBeenCalled();
    await controller.dispose();
  });
  it('does not overwrite a new call when an old audio resume rejects', async () => {
    const { controller, audio } = rig();
    await controller.startCall();
    let rejectResume: (error: Error) => void = () => undefined;
    audio.resume = (): Promise<void> =>
      new Promise((_resolve, reject) => {
        rejectResume = reject;
      });
    const sending = controller.sendText('Hello');
    controller.endCall();
    audio.resume = (): Promise<void> => Promise.resolve();
    await controller.startCall();
    rejectResume(new Error('old context operation'));
    await sending;
    expect(controller.snapshot().error).toBeNull();
    expect(controller.snapshot().textFallback).toBe(false);
    await controller.dispose();
  });
  it('bounds an overlong capture without uploading it', async () => {
    vi.useFakeTimers();
    const { controller, deps, capture, callbacks } = rig();
    try {
      await controller.startCall();
      callbacks().onSpeechStart();
      await vi.advanceTimersByTimeAsync(CALL_SETTINGS.maxCaptureMs);
      expect(capture.pause).toHaveBeenCalledOnce();
      expect(capture.start).toHaveBeenCalledOnce();
      expect(deps.send).not.toHaveBeenCalled();
      expect(controller.snapshot().error).toContain('too long');
      await controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
