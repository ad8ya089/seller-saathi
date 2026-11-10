import type { MicVAD } from '@ricky0123/vad-web';
import { AppError } from '@/lib/errors';
import { abortable, throwIfAborted } from '@/lib/voice/abort';
import { CALL_SETTINGS, VAD_SETTINGS } from '@/lib/client/vad-settings';
import type {
  MicrophoneCallbacks,
  MicrophoneHandle,
} from '@/lib/client/voice-state';

export async function openBrowserMicrophone(
  context: AudioContext,
  callbacks: MicrophoneCallbacks,
  signal: AbortSignal,
): Promise<MicrophoneHandle> {
  throwIfAborted(signal);
  if (
    typeof navigator.mediaDevices === 'undefined' ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  )
    throw new AppError(
      'MICROPHONE_UNAVAILABLE',
      'Microphone access needs HTTPS or localhost. You can still type a message.',
    );
  let stream: MediaStream | undefined;
  let vad: MicVAD | undefined;
  let destroyed = false;
  const stopTracks = (): void => {
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
  };
  const destroy = async (): Promise<void> => {
    if (destroyed) return;
    destroyed = true;
    stopTracks();
    signal.removeEventListener('abort', stopTracks);
    await vad?.destroy();
  };
  try {
    const permission = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    // Permission dialogs cannot be cancelled by JavaScript. Release a stream
    // granted after End Call without keeping the call's initialization pending.
    void permission
      .then((lateStream): void => {
        if (signal.aborted)
          lateStream.getTracks().forEach((track) => {
            track.stop();
          });
      })
      .catch(() => undefined);
    stream = await abortable(permission, signal);
    if (signal.aborted) {
      stopTracks();
      throwIfAborted(signal);
    }
    signal.addEventListener('abort', stopTracks, { once: true });
    // Preflight the worklet before allocating a model session.
    if (typeof context.audioWorklet !== 'undefined')
      await context.audioWorklet.addModule(
        `${VAD_SETTINGS.baseAssetPath}vad.worklet.bundle.min.js`,
      );
    const { MicVAD: Vad } = await import('@ricky0123/vad-web');
    const capturedStream = stream;
    vad = await Vad.new({
      ...VAD_SETTINGS,
      audioContext: context,
      getStream: (): Promise<MediaStream> => Promise.resolve(capturedStream),
      pauseStream: (): Promise<void> => Promise.resolve(),
      resumeStream: (): Promise<MediaStream> => Promise.resolve(capturedStream),
      // Confirm minSpeechMs before interrupting; short echo/noise bursts remain misfires.
      onSpeechRealStart: callbacks.onSpeechStart,
      onSpeechEnd: callbacks.onSpeechEnd,
      onVADMisfire: callbacks.onMisfire,
      onFrameProcessed: (probabilities): void => {
        if (probabilities.isSpeech >= VAD_SETTINGS.negativeSpeechThreshold)
          callbacks.onVoiceFrame();
      },
      ortConfig: (ort): void => {
        ort.env.logLevel = 'error';
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        ort.env.wasm.wasmPaths = {
          mjs: new URL('/vad/ort-wasm-simd-threaded.mjs', window.location.href)
            .href,
          wasm: new URL(
            '/vad/ort-wasm-simd-threaded.wasm',
            window.location.href,
          ).href,
        };
      },
    });
    // The installed library needs start() before its public destroy() can run.
    // A cancelled stream is already stopped; finish initialization, then release.
    await vad.start();
    if (signal.aborted) {
      await destroy();
      throwIfAborted(signal);
    }
    const activeVad = vad;
    return {
      setPlayback: (playing): void => {
        activeVad.setOptions({
          positiveSpeechThreshold: playing
            ? CALL_SETTINGS.playbackSpeechThreshold
            : VAD_SETTINGS.positiveSpeechThreshold,
        });
      },
      pause: (): Promise<void> => activeVad.pause(),
      start: (): Promise<void> => {
        throwIfAborted(signal);
        return activeVad.start();
      },
      destroy,
    };
  } catch (error: unknown) {
    await destroy().catch(() => undefined);
    throwIfAborted(signal);
    if (
      error instanceof DOMException &&
      ['NotAllowedError', 'SecurityError'].includes(error.name)
    )
      throw new AppError(
        'MICROPHONE_UNAVAILABLE',
        'Microphone permission was denied. Type below, or enable the microphone in your browser and start again.',
      );
    throw new AppError(
      'MICROPHONE_UNAVAILABLE',
      'Microphone setup failed. You can still type a message below.',
      true,
    );
  }
}
