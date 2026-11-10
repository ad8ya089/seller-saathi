export type ErrorCode =
  | 'CONFIG_INVALID'
  | 'DATA_NOT_FOUND'
  | 'DATA_INVALID'
  | 'DATA_IO'
  | 'LEDGER_IO'
  | 'LEDGER_INVALID'
  | 'INSUFFICIENT_ACTIONS'
  | 'INVALID_DATE';

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
