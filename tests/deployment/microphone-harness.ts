import '../../src/instrumentation-client';
import { openBrowserMicrophone } from '@/lib/client/browser-microphone';

export async function verifyMicrophone(): Promise<{
  frames: number;
  released: boolean;
}> {
  const context = new AudioContext();
  await context.resume();
  let frames = 0;
  let captured: MediaStream | undefined;
  const original = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices,
  );
  navigator.mediaDevices.getUserMedia = async (
    constraints,
  ): Promise<MediaStream> => {
    captured = await original(constraints);
    return captured;
  };
  const microphone = await openBrowserMicrophone(
    context,
    {
      onSpeechStart: () => undefined,
      onSpeechEnd: () => undefined,
      onMisfire: () => undefined,
      onVoiceFrame: () => {
        frames += 1;
      },
    },
    new AbortController().signal,
  );
  try {
    const deadline = performance.now() + 15000;
    while (!frames && performance.now() < deadline)
      await new Promise((r) => setTimeout(r, 100));
    await microphone.pause();
    await microphone.start();
  } finally {
    await microphone.destroy();
    await context.close();
    navigator.mediaDevices.getUserMedia = original;
  }
  return {
    frames,
    released:
      captured?.getTracks().every((track) => track.readyState === 'ended') ??
      false,
  };
}
