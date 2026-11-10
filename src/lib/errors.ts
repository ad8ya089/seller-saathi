import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'CONFIG_INVALID',
  'DATA_NOT_FOUND',
  'DATA_INVALID',
  'DATA_IO',
  'LEDGER_IO',
  'LEDGER_INVALID',
  'INSUFFICIENT_ACTIONS',
  'INVALID_DATE',
  'INVALID_AUDIO',
  'UPLOAD_TOO_LARGE',
  'INVALID_INPUT',
  'NO_SPEECH',
  'PROVIDER_CONFIG',
  'PROVIDER_AUTH',
  'PROVIDER_REJECTED',
  'PROVIDER_RATE_LIMIT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RESPONSE_INVALID',
  'REQUEST_ABORTED',
  'STREAM_INVALID',
  'AUDIO_PLAYBACK',
  'MICROPHONE_UNAVAILABLE',
  'SESSION_NOT_FOUND',
  'SESSION_EXPIRED',
  'SESSION_LIMIT',
  'SESSION_BUSY',
  'TURN_CONFLICT',
  'TOOL_NOT_ALLOWED',
  'COMMIT_REJECTED',
  'LLM_LOOP_LIMIT',
  'SPEECH_INVALID',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
