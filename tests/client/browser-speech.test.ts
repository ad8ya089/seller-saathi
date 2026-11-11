import { afterEach, describe, expect, it, vi } from 'vitest';
import { speakBrowserFallback } from '@/lib/client/browser-speech';

class Utterance {
  lang = '';
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}
afterEach(() => vi.unstubAllGlobals());

describe('browser voice fallback', () => {
  it('uses an installed Hindi voice and never substitutes an English-only voice', async () => {
    const speak = vi.fn<(utterance: Utterance) => void>();
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    vi.stubGlobal('speechSynthesis', {
      speak,
      cancel: vi.fn(),
      getVoices: () => [{ lang: 'hi-IN' }],
    });
    const running = speakBrowserFallback(
      'Samajh gaya.',
      new AbortController().signal,
      'hi-IN',
    );
    expect(speak.mock.calls[0]?.[0].lang).toBe('hi-IN');
    speak.mock.calls[0]?.[0].onend?.();
    await running;
    speak.mockClear();
    vi.stubGlobal('speechSynthesis', {
      speak,
      cancel: vi.fn(),
      getVoices: () => [{ lang: 'en-IN' }],
    });
    await expect(
      speakBrowserFallback(
        'Samajh gaya.',
        new AbortController().signal,
        'hi-IN',
      ),
    ).rejects.toMatchObject({ code: 'AUDIO_PLAYBACK' });
    expect(speak).not.toHaveBeenCalled();
  });
  it('speaks English-India and resolves only after playback ends', async () => {
    const speak = vi.fn<(utterance: Utterance) => void>();
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    const completed = vi.fn();
    const running = speakBrowserFallback(
      'Understood.',
      new AbortController().signal,
    ).then(completed);
    const utterance = speak.mock.calls[0]?.[0];
    expect(utterance?.lang).toBe('en-IN');
    expect(utterance?.text).toBe('Understood.');
    expect(completed).not.toHaveBeenCalled();
    utterance?.onend?.();
    await running;
    expect(completed).toHaveBeenCalledOnce();
  });
  it('keeps cancellation typed even when browser cancel synchronously fires an error', async () => {
    let utterance: Utterance | undefined;
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    const cancel = vi.fn(() => utterance?.onerror?.());
    vi.stubGlobal('speechSynthesis', {
      speak: (value: Utterance): void => {
        utterance = value;
      },
      cancel,
    });
    const abort = new AbortController();
    const running = speakBrowserFallback('Understood.', abort.signal);
    abort.abort();
    await expect(running).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
