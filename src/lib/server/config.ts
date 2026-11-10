import 'server-only';
import { z } from 'zod';
import { pricingSchema } from '@/lib/server/cost';
import type { Pricing } from '@/lib/server/cost';
import { AppError } from '@/lib/errors';
import {
  compatibleSpeaker,
  DEFAULT_SPEAKERS,
  sttLanguageSchema,
  sttModeSchema,
  sttModelSchema,
  ttsLanguageSchema,
  ttsModelSchema,
} from '@/lib/voice/sarvam-contracts';
import {
  investigationPolicySchema,
  thresholdSchema,
} from '@/lib/domain/settings';
import type {
  InvestigationPolicy,
  SignalThresholds,
} from '@/lib/domain/settings';

const optionalText = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().min(1).optional(),
);
const numeric = (schema: z.ZodNumber): z.ZodType<number, string> =>
  z.string().trim().min(1).pipe(z.coerce.number()).pipe(schema);
const integer = (
  value: number,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
): z.ZodDefault<z.ZodType<number, string>> =>
  numeric(z.number().int().min(min).max(max)).default(value);
const boolean = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: integer(3000, 1, 65535),
  HOSTNAME: z.string().trim().min(1).default('0.0.0.0'),
  GEMINI_API_KEY: optionalText,
  SARVAM_API_KEY: optionalText,
  SELLER_SIM_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_FALLBACK_MODEL: z.string().min(1).default('gemini-3.6-flash'),
  GEMINI_THINKING_LEVEL: z
    .enum(['minimal', 'low', 'medium', 'high'])
    .default('minimal'),
  GEMINI_TIMEOUT_MS: integer(8000),
  GEMINI_RETRIES: integer(1, 0, 1),
  GEMINI_MAX_OUTPUT_TOKENS: integer(300),
  GEMINI_TEMPERATURE: numeric(z.number().min(0).max(2)).default(0.4),
  SARVAM_STT_MODEL: sttModelSchema.default('saaras:v4'),
  SARVAM_STT_LANGUAGE: sttLanguageSchema.default('unknown'),
  SARVAM_STT_MODE: sttModeSchema.default('transcribe'),
  SARVAM_TTS_MODEL: ttsModelSchema.default('bulbul:v4-flash'),
  SARVAM_TTS_SPEAKER: z.string().min(1).optional(),
  SARVAM_TTS_LANGUAGE: ttsLanguageSchema.default('en-IN'),
  SARVAM_TTS_PACE: numeric(z.number().min(0.5).max(2)).default(1),
  SARVAM_TTS_SAMPLE_RATE: z
    .literal(24000)
    .default(24000)
    .or(z.literal('24000').transform(() => 24000)),
  SARVAM_TIMEOUT_MS: integer(6000),
  SARVAM_RETRIES: integer(1, 0, 1),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  LOG_TRANSCRIPTS: boolean,
  SESSION_TTL_MS: integer(1_800_000, 1, 1_800_000),
  SESSION_MAX_TURNS: integer(25, 1, 25),
  SESSION_MAX_MS: integer(600_000, 1, 600_000),
  RATE_LIMIT_TURNS: integer(40),
  RATE_LIMIT_WINDOW_MS: integer(600_000),
  DAILY_TURN_CAP: integer(800),
  PROVIDER_PRICING_JSON: z.preprocess((value) => {
    if (value === undefined || value === '') return undefined;
    try {
      return typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
    } catch {
      return null;
    }
  }, pricingSchema.optional()),
  MAX_UTTERANCE_BYTES: integer(1_048_576),
  MAX_UTTERANCE_MS: integer(28000, 1, 30000),
  MAX_QUESTIONS: integer(3, 2, 3),
  MAX_TOOL_ROUNDS: integer(4, 1, 4),
  DATA_DIR: z.string().trim().min(1).default('.data'),
  MOCK_DATA_DIR: z.string().trim().min(1).default('data'),
  DEMO_ACCESS_CODE: optionalText,
  TRUSTED_PROXY_TOKEN: optionalText,
  INTERNAL_METRICS_TOKEN: optionalText,
  DOMAIN: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/)
      .optional(),
  ),
  ORDER_DROP_PCT: numeric(z.number().min(-100).max(0)).optional(),
  ASP_FLAT_PCT: numeric(z.number().nonnegative()).optional(),
  OOS_RATIO: numeric(z.number().min(1)).optional(),
  OOS_INCREASE: numeric(z.number().int().nonnegative()).optional(),
  CANCEL_INCREASE_PP: numeric(z.number().nonnegative()).optional(),
  CONCENTRATION_PCT: numeric(z.number().min(0).max(100)).optional(),
  STOCK_CANCEL_PCT: numeric(z.number().min(0).max(100)).optional(),
  DISPATCH_CANCEL_PCT: numeric(z.number().min(0).max(100)).optional(),
});

type Environment = z.infer<typeof environmentSchema>;
export interface AppConfig {
  sellerSimModel: string;
  environment: Environment['NODE_ENV'];
  port: number;
  hostname: string;
  providers: { gemini: boolean; sarvam: boolean };
  gemini: {
    apiKey: string | undefined;
    model: string;
    fallbackModel: string;
    thinkingLevel: Environment['GEMINI_THINKING_LEVEL'];
    timeoutMs: number;
    retries: number;
    maxOutputTokens: number;
    temperature: number;
  };
  sarvam: {
    apiKey: string | undefined;
    timeoutMs: number;
    retries: number;
    stt: {
      model: Environment['SARVAM_STT_MODEL'];
      language: Environment['SARVAM_STT_LANGUAGE'];
      mode: Environment['SARVAM_STT_MODE'];
    };
    tts: {
      model: Environment['SARVAM_TTS_MODEL'];
      speaker: string;
      language: Environment['SARVAM_TTS_LANGUAGE'];
      pace: number;
      sampleRate: number;
    };
  };
  logLevel: Environment['LOG_LEVEL'];
  logTranscripts: boolean;
  sessionTtlMs: number;
  sessionMaxTurns: number;
  sessionMaxMs: number;
  rateLimitTurns: number;
  rateLimitWindowMs: number;
  dailyTurnCap: number;
  pricing: Pricing | undefined;
  maxUtteranceBytes: number;
  maxUtteranceMs: number;
  maxToolRounds: number;
  dataDir: string;
  mockDataDir: string;
  demoAccessCode: string | undefined;
  trustedProxyToken: string | undefined;
  internalMetricsToken: string | undefined;
  domain: string | undefined;
  thresholds: SignalThresholds;
  investigation: InvestigationPolicy;
}

export function parseConfig(
  environment: Record<string, string | undefined>,
): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new AppError('CONFIG_INVALID', `Invalid configuration: ${issues}`);
  }
  const env = parsed.data;
  const speaker =
    env.SARVAM_TTS_SPEAKER ?? DEFAULT_SPEAKERS[env.SARVAM_TTS_MODEL];
  if (!compatibleSpeaker(env.SARVAM_TTS_MODEL, speaker))
    throw new AppError(
      'CONFIG_INVALID',
      'Invalid configuration: SARVAM_TTS_SPEAKER must match SARVAM_TTS_MODEL',
    );
  return {
    sellerSimModel: env.SELLER_SIM_MODEL,
    environment: env.NODE_ENV,
    port: env.PORT,
    hostname: env.HOSTNAME,
    providers: {
      gemini: Boolean(env.GEMINI_API_KEY),
      sarvam: Boolean(env.SARVAM_API_KEY),
    },
    gemini: {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      fallbackModel: env.GEMINI_FALLBACK_MODEL,
      thinkingLevel: env.GEMINI_THINKING_LEVEL,
      timeoutMs: env.GEMINI_TIMEOUT_MS,
      retries: env.GEMINI_RETRIES,
      maxOutputTokens: env.GEMINI_MAX_OUTPUT_TOKENS,
      temperature: env.GEMINI_TEMPERATURE,
    },
    sarvam: {
      apiKey: env.SARVAM_API_KEY,
      timeoutMs: env.SARVAM_TIMEOUT_MS,
      retries: env.SARVAM_RETRIES,
      stt: {
        model: env.SARVAM_STT_MODEL,
        language: env.SARVAM_STT_LANGUAGE,
        mode: env.SARVAM_STT_MODE,
      },
      tts: {
        model: env.SARVAM_TTS_MODEL,
        speaker,
        language: env.SARVAM_TTS_LANGUAGE,
        pace: env.SARVAM_TTS_PACE,
        sampleRate: env.SARVAM_TTS_SAMPLE_RATE,
      },
    },
    logLevel: env.LOG_LEVEL,
    logTranscripts: env.LOG_TRANSCRIPTS,
    sessionTtlMs: env.SESSION_TTL_MS,
    sessionMaxTurns: env.SESSION_MAX_TURNS,
    sessionMaxMs: env.SESSION_MAX_MS,
    rateLimitTurns: env.RATE_LIMIT_TURNS,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    dailyTurnCap: env.DAILY_TURN_CAP,
    pricing: env.PROVIDER_PRICING_JSON,
    maxUtteranceBytes: env.MAX_UTTERANCE_BYTES,
    maxUtteranceMs: env.MAX_UTTERANCE_MS,
    maxToolRounds: env.MAX_TOOL_ROUNDS,
    dataDir: env.DATA_DIR,
    mockDataDir: env.MOCK_DATA_DIR,
    demoAccessCode: env.DEMO_ACCESS_CODE,
    trustedProxyToken: env.TRUSTED_PROXY_TOKEN,
    internalMetricsToken: env.INTERNAL_METRICS_TOKEN,
    domain: env.DOMAIN,
    thresholds: thresholdSchema.parse({
      orderDropPct: env.ORDER_DROP_PCT,
      aspFlatPct: env.ASP_FLAT_PCT,
      oosRatio: env.OOS_RATIO,
      oosIncrease: env.OOS_INCREASE,
      cancelIncreasePp: env.CANCEL_INCREASE_PP,
      concentrationPct: env.CONCENTRATION_PCT,
      stockCancelPct: env.STOCK_CANCEL_PCT,
      dispatchCancelPct: env.DISPATCH_CANCEL_PCT,
    }),
    investigation: investigationPolicySchema.parse({
      maxQuestions: env.MAX_QUESTIONS,
    }),
  };
}

let cachedConfig: AppConfig | undefined;

export function getConfig(): AppConfig {
  cachedConfig ??= parseConfig(process.env);
  return cachedConfig;
}
