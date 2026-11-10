import { AppError } from '@/lib/errors';
import { AudioQueue } from '@/lib/client/audio-queue';
import type { DecodedClip } from '@/lib/client/audio-queue';
import { openBrowserMicrophone } from '@/lib/client/browser-microphone';
import type {
  AudioResources,
  MicrophoneHandle,
} from '@/lib/client/voice-state';

export function createBrowserAudio(): AudioResources {
  if (typeof AudioContext === 'undefined')
    throw new AppError(
      'AUDIO_PLAYBACK',
      'This browser does not support voice playback. Please try Chrome.',
    );
  const context = new AudioContext();
  return {
    createQueue: (): AudioQueue =>
      new AudioQueue({
        now: (): number => context.currentTime,
        decode: async (bytes): Promise<DecodedClip> => {
          if (context.state !== 'running')
            throw new AppError(
              'AUDIO_PLAYBACK',
              'Audio is paused. Send a text message or restart the call.',
            );
          const buffer = await context.decodeAudioData(bytes);
          return {
            duration: buffer.duration,
            play: (when, onEnded): { stop: () => void } => {
              const source = context.createBufferSource();
              source.buffer = buffer;
              let stopped = false;
              source.onended = (): void => {
                if (stopped) return;
                stopped = true;
                source.disconnect();
                onEnded();
              };
              try {
                source.connect(context.destination);
                source.start(when);
              } catch (error: unknown) {
                source.disconnect();
                throw error;
              }
              return {
                stop: (): void => {
                  if (stopped) return;
                  stopped = true;
                  source.onended = null;
                  try {
                    source.stop();
                  } finally {
                    source.disconnect();
                  }
                },
              };
            },
          };
        },
      }),
    resume: (): Promise<void> => context.resume(),
    suspend: (): Promise<void> =>
      context.state === 'closed' ? Promise.resolve() : context.suspend(),
    close: (): Promise<void> =>
      context.state === 'closed' ? Promise.resolve() : context.close(),
    openMicrophone: (callbacks, signal): Promise<MicrophoneHandle> =>
      openBrowserMicrophone(context, callbacks, signal),
  };
}
