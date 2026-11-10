import 'server-only';
import { AppError } from '@/lib/errors';
import { abortable, throwIfAborted, waitForRetry } from '@/lib/voice/abort';
import { VOICE_LIMITS } from '@/lib/voice/limits';

export interface SarvamHttpSettings {
  apiKey: string | undefined;
  timeoutMs: number;
  retries: number;
}
interface JsonResult {
  body: unknown;
  ms: number;
}
const MAX_RETRY_WAIT_MS = 1000;

function statusError(status: number): AppError {
  if (status === 401 || status === 403)
    return new AppError(
      'PROVIDER_AUTH',
      `Sarvam rejected the credentials (HTTP ${String(status)})`,
    );
  if (status === 429)
    return new AppError(
      'PROVIDER_RATE_LIMIT',
      'Sarvam is rate limited (HTTP 429)',
      true,
    );
  if (status >= 500)
    return new AppError(
      'PROVIDER_UNAVAILABLE',
      `Sarvam is unavailable (HTTP ${String(status)})`,
      true,
    );
  return new AppError(
    'PROVIDER_REJECTED',
    `Sarvam rejected the request (HTTP ${String(status)})`,
  );
}
function retryDelay(value: string | null): number {
  if (value === null) return 200;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 200;
}

async function readJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (!response.body)
    throw new AppError(
      'PROVIDER_RESPONSE_INVALID',
      'Sarvam returned an empty response',
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await abortable(reader.read(), signal);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > Math.ceil(VOICE_LIMITS.ttsAudioBytes / 3) * 4 + 16384)
        throw new AppError(
          'PROVIDER_RESPONSE_INVALID',
          'Sarvam returned an oversized response',
        );
      chunks.push(chunk.value);
    }
    try {
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return value;
    } catch {
      throw new AppError(
        'PROVIDER_RESPONSE_INVALID',
        'Sarvam returned invalid JSON',
      );
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function postSarvamJson(
  path: 'speech-to-text' | 'text-to-speech',
  settings: SarvamHttpSettings,
  makeRequest: () => RequestInit,
  fetcher: typeof fetch = fetch,
  caller?: AbortSignal,
): Promise<JsonResult> {
  if (!settings.apiKey)
    throw new AppError(
      'PROVIDER_CONFIG',
      'Set SARVAM_API_KEY in the local .env to use voice providers',
    );
  if (
    !Number.isInteger(settings.timeoutMs) ||
    settings.timeoutMs <= 0 ||
    !Number.isInteger(settings.retries) ||
    settings.retries < 0 ||
    settings.retries > 1
  )
    throw new AppError(
      'PROVIDER_CONFIG',
      'Sarvam timeout and retry settings are invalid',
    );
  throwIfAborted(caller);
  const started = performance.now();
  const lifetime = new AbortController();
  const overall = setTimeout(
    () => {
      lifetime.abort();
    },
    settings.timeoutMs * (settings.retries + 1) + MAX_RETRY_WAIT_MS,
  );
  const lifetimeSignal = caller
    ? AbortSignal.any([caller, lifetime.signal])
    : lifetime.signal;
  try {
    for (let attempt = 0; attempt <= settings.retries; attempt += 1) {
      const timeout = new AbortController();
      const timer = setTimeout(() => {
        timeout.abort();
      }, settings.timeoutMs);
      const signal = AbortSignal.any([lifetimeSignal, timeout.signal]);
      let delay: number | undefined;
      try {
        const init = makeRequest();
        const headers = new Headers(init.headers);
        headers.set('api-subscription-key', settings.apiKey);
        const response = await abortable(
          fetcher(`https://api.sarvam.ai/${path}`, {
            ...init,
            method: 'POST',
            headers,
            signal,
            redirect: 'error',
          }),
          signal,
        );
        if (response.ok)
          return {
            body: await readJson(response, signal),
            ms: performance.now() - started,
          };
        await response.body?.cancel();
        const error = statusError(response.status);
        const retryableStatus =
          response.status === 429 || response.status >= 500;
        delay = retryDelay(response.headers.get('Retry-After'));
        if (
          !retryableStatus ||
          attempt >= settings.retries ||
          delay > MAX_RETRY_WAIT_MS
        )
          throw error;
      } finally {
        clearTimeout(timer);
      }
      await waitForRetry(delay, lifetimeSignal);
    }
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      'Sarvam did not complete the request',
      true,
    );
  } catch (error: unknown) {
    if (caller?.aborted)
      throw new AppError('REQUEST_ABORTED', 'The request was cancelled');
    if (error instanceof AppError && error.code !== 'REQUEST_ABORTED')
      throw error;
    if (error instanceof AppError || lifetime.signal.aborted)
      throw new AppError(
        'PROVIDER_TIMEOUT',
        'Sarvam did not respond before the deadline',
        true,
      );
    throw new AppError('PROVIDER_UNAVAILABLE', 'Unable to reach Sarvam', true);
  } finally {
    clearTimeout(overall);
  }
}
