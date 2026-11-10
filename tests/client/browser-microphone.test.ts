import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RealTimeVADOptions } from '@ricky0123/vad-web';
import type * as Ort from 'onnxruntime-web/wasm';
import { openBrowserMicrophone } from '@/lib/client/browser-microphone';
import type { MicrophoneCallbacks } from '@/lib/client/voice-state';

const vad = vi.hoisted(() => ({
  create: vi.fn<(options: Partial<RealTimeVADOptions>) => Promise<unknown>>(),
  start: vi.fn<() => Promise<void>>(),
  pause: vi.fn<() => Promise<void>>(),
  destroy: vi.fn<() => Promise<void>>(),
}));
vi.mock('@ricky0123/vad-web', () => ({ MicVAD: { new: vad.create } }));

function rig(): {
  context: AudioContext;
  callbacks: MicrophoneCallbacks;
  media: ReturnType<typeof vi.fn<MediaDevices['getUserMedia']>>;
  stream: MediaStream;
  stop: ReturnType<typeof vi.fn>;
  addModule: ReturnType<typeof vi.fn<() => Promise<void>>>;
} {
  const stop = vi.fn<() => void>();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const media = vi.fn<MediaDevices['getUserMedia']>().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: media } });
  vi.stubGlobal('window', { location: { href: 'http://localhost:3000/' } });
  vad.create.mockResolvedValue(vad);
  vad.start.mockResolvedValue(undefined);
  vad.pause.mockResolvedValue(undefined);
  vad.destroy.mockResolvedValue(undefined);
  const addModule = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const context = { audioWorklet: { addModule } } as unknown as AudioContext;
  return {
    context,
    stream,
    media,
    stop,
    addModule,
    callbacks: {
      onSpeechStart: vi.fn<() => void>(),
      onSpeechEnd: vi.fn<(samples: Float32Array) => void>(),
      onVoiceFrame: vi.fn<() => void>(),
      onMisfire: vi.fn<() => void>(),
    },
  };
}
afterEach(() => {
  vi.clearAllMocks();
});

describe('browser microphone adapter', () => {
  it('uses local v6 assets, half-duplex settings, and stops every track on cleanup', async () => {
    const { context, callbacks, media, stream, stop } = rig();
    const abort = new AbortController();
    const microphone = await openBrowserMicrophone(
      context,
      callbacks,
      abort.signal,
    );
    expect(media).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    const options = vad.create.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      model: 'v6',
      baseAssetPath: '/vad/',
      onnxWASMBasePath: '/vad/',
      startOnLoad: false,
      submitUserSpeechOnPause: false,
    });
    const runtime = { env: { wasm: {} } } as unknown as typeof Ort;
    options?.ortConfig?.(runtime);
    expect(runtime.env.wasm).toEqual({
      numThreads: 1,
      proxy: false,
      wasmPaths: {
        mjs: 'http://localhost:3000/vad/ort-wasm-simd-threaded.mjs',
        wasm: 'http://localhost:3000/vad/ort-wasm-simd-threaded.wasm',
      },
    });
    await options?.onFrameProcessed?.(
      { isSpeech: 0.1, notSpeech: 0.9 },
      new Float32Array(512),
    );
    expect(callbacks.onVoiceFrame).not.toHaveBeenCalled();
    await options?.onFrameProcessed?.(
      { isSpeech: 0.8, notSpeech: 0.2 },
      new Float32Array(512),
    );
    expect(callbacks.onVoiceFrame).toHaveBeenCalledOnce();
    expect(await options?.getStream?.()).toBe(stream);
    await options?.pauseStream?.(stream);
    expect(stop).not.toHaveBeenCalled();
    await microphone.pause();
    await microphone.start();
    expect(vad.pause).toHaveBeenCalledOnce();
    abort.abort();
    expect(stop).toHaveBeenCalledOnce();
    await microphone.destroy();
    await microphone.destroy();
    expect(vad.destroy).toHaveBeenCalledOnce();
  });
  it('sanitizes denied permission and never allocates VAD', async () => {
    const { context, callbacks, media } = rig();
    media.mockRejectedValue(
      new DOMException('private provider body', 'NotAllowedError'),
    );
    await expect(
      openBrowserMicrophone(context, callbacks, new AbortController().signal),
    ).rejects.toThrow('Microphone permission was denied');
    expect(vad.create).not.toHaveBeenCalled();
  });
  it('releases a late permission result after cancellation without retaining a context', async () => {
    const { context, callbacks, media, stream, stop } = rig();
    let allow: (stream: MediaStream) => void = () => undefined;
    media.mockImplementation(
      () =>
        new Promise((resolve) => {
          allow = resolve;
        }),
    );
    const abort = new AbortController();
    const pending = openBrowserMicrophone(context, callbacks, abort.signal);
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
    });
    abort.abort();
    await rejection;
    allow(stream);
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
    expect(vad.create).not.toHaveBeenCalled();
  });
  it('stops the stream and offers fallback when the worklet fails', async () => {
    const { context, callbacks, stop, addModule } = rig();
    addModule.mockRejectedValue(new Error('asset missing'));
    await expect(
      openBrowserMicrophone(context, callbacks, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'MICROPHONE_UNAVAILABLE' });
    expect(stop).toHaveBeenCalledOnce();
    expect(vad.create).not.toHaveBeenCalled();
  });
});
