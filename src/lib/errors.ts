export type ErrorCode =
  | 'CONFIG_INVALID'
  | 'DATA_NOT_FOUND'
  | 'DATA_INVALID'
  | 'DATA_IO'
  | 'LEDGER_IO'
  | 'LEDGER_INVALID'
  | 'INSUFFICIENT_ACTIONS'
  | 'INVALID_DATE'
  | 'INVALID_AUDIO'
  | 'UPLOAD_TOO_LARGE'
  | 'INVALID_INPUT'
  | 'NO_SPEECH'
  | 'PROVIDER_CONFIG'
  | 'PROVIDER_AUTH'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RESPONSE_INVALID'
  | 'REQUEST_ABORTED'
  | 'INTERNAL';

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
