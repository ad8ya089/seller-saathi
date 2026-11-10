import { AppError } from '@/lib/errors';

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new AppError('REQUEST_ABORTED', 'The request was cancelled');
}

export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      reject(new AppError('REQUEST_ABORTED', 'The request was cancelled'));
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    const cleanup = (): void => {
      signal.removeEventListener('abort', abort);
    };
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(
          error instanceof Error
            ? error
            : new AppError('INTERNAL', 'Operation failed'),
        );
      },
    );
  });
}

export function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer);
      reject(new AppError('REQUEST_ABORTED', 'The request was cancelled'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
