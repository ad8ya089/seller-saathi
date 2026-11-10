import 'server-only';
import pino from 'pino';
import type { DestinationStream, Logger } from 'pino';
import { AppError } from '@/lib/errors';
import { getConfig } from '@/lib/server/config';

interface LogOptions {
  level: string;
  logTranscripts: boolean;
}
const secretFields = [
  'trustedProxyToken',
  'internalMetricsToken',
  'TRUSTED_PROXY_TOKEN',
  'INTERNAL_METRICS_TOKEN',
  'apiKey',
  'GEMINI_API_KEY',
  'SARVAM_API_KEY',
  'DEMO_ACCESS_CODE',
  'demoAccessCode',
  'authorization',
  'headers',
];
const transcriptFields = [
  'transcript',
  'text',
  'quote',
  'confirmationQuote',
  'lastUserText',
  'history',
];

export function createLogger(
  options: LogOptions,
  destination?: DestinationStream,
): Logger {
  const fields = options.logTranscripts
    ? secretFields
    : [...secretFields, ...transcriptFields];
  return pino(
    {
      level: options.level,
      base: { service: 'seller-saathi' },
      redact: {
        paths: fields.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
        remove: true,
      },
      serializers: {
        err: (
          error: unknown,
        ): { code: string; message: string; retryable: boolean } =>
          error instanceof AppError
            ? {
                code: error.code,
                message: error.message,
                retryable: error.retryable,
              }
            : {
                code: 'INTERNAL',
                message: 'Operation failed',
                retryable: false,
              },
      },
    },
    destination,
  );
}

let cachedLogger: Logger | undefined;
export function getLogger(): Logger {
  const config = getConfig();
  cachedLogger ??= createLogger({
    level: config.logLevel,
    logTranscripts: config.logTranscripts,
  });
  return cachedLogger;
}
