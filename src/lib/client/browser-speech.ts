import { AppError } from '@/lib/errors';
import { throwIfAborted } from '@/lib/voice/abort';

export function speakBrowserFallback(
  text: string,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  if (
    typeof speechSynthesis === 'undefined' ||
    typeof SpeechSynthesisUtterance === 'undefined'
  )
    return Promise.reject(
      new AppError(
        'AUDIO_PLAYBACK',
        'Browser voice is unavailable. Please read the transcript.',
      ),
    );
  return new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    let finished = false;
    const complete = (error?: AppError): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      utterance.onend = null;
      utterance.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const abort = (): void => {
      complete(new AppError('REQUEST_ABORTED', 'The request was cancelled'));
      speechSynthesis.cancel();
    };
    const timer = setTimeout(() => {
      complete(
        new AppError(
          'AUDIO_PLAYBACK',
          'Browser voice timed out. Please read the transcript.',
        ),
      );
      speechSynthesis.cancel();
    }, 20000);
    signal.addEventListener('abort', abort, { once: true });
    utterance.onend = (): void => {
      complete();
    };
    utterance.onerror = (): void => {
      complete(
        new AppError(
          'AUDIO_PLAYBACK',
          'Browser voice could not play. Please read the transcript.',
        ),
      );
    };
    try {
      speechSynthesis.speak(utterance);
    } catch {
      complete(
        new AppError(
          'AUDIO_PLAYBACK',
          'Browser voice could not start. Please read the transcript.',
        ),
      );
    }
  });
}
