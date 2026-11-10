import 'server-only';
import { AppError } from '@/lib/errors';
import type { ErrorCode } from '@/lib/errors';
import { publicErrorSchema } from '@/lib/voice/events';
import type { z } from 'zod';

const MESSAGES: Readonly<Partial<Record<ErrorCode, string>>> = {
  INVALID_INPUT:
    'Send a short text message or a valid microphone WAV with a call identifier.',
  INVALID_AUDIO:
    'Please record mono PCM16 WAV audio at sixteen kilohertz, within twenty-eight seconds.',
  UPLOAD_TOO_LARGE:
    'The audio or request is too large. Please use a shorter recording.',
  NO_SPEECH: 'No speech was recognized. Please try again or use text input.',
  PROVIDER_CONFIG:
    'Agent or speech is not configured. Check GEMINI_API_KEY and SARVAM_API_KEY privately in the server .env.',
  PROVIDER_AUTH:
    'The voice service rejected its credentials. Check the server configuration.',
  PROVIDER_REJECTED:
    'The voice service could not accept this request. Please try a short message.',
  PROVIDER_RATE_LIMIT:
    'The voice service is busy. Please wait briefly and try again.',
  PROVIDER_UNAVAILABLE: 'The voice service is unavailable. Please try again.',
  PROVIDER_TIMEOUT: 'The voice service took too long. Please try again.',
  PROVIDER_RESPONSE_INVALID:
    'The voice service returned unusable audio or text. Please try again.',
  REQUEST_ABORTED: 'The request was cancelled.',
  SESSION_NOT_FOUND: 'Start a new call to continue.',
  SESSION_EXPIRED: 'This call has expired. Start a new call.',
  SESSION_LIMIT:
    'This call has finished or reached its limit. Start a new call.',
  SESSION_BUSY: 'Another turn is still running. Please wait.',
  TURN_CONFLICT: 'This turn identifier was already used for different input.',
  COMMIT_REJECTED:
    'The plan was not saved. Please review it and give clear acceptance.',
  TOOL_NOT_ALLOWED: 'That operation is not allowed at this stage of the call.',
  LLM_LOOP_LIMIT: 'The agent could not complete its checks. Please try again.',
  SPEECH_INVALID: 'The agent response could not be verified. Please try again.',
};
export function publicVoiceError(
  error: unknown,
): z.infer<typeof publicErrorSchema> {
  const known = error instanceof AppError && MESSAGES[error.code] !== undefined;
  return publicErrorSchema.parse({
    code: known ? error.code : 'INTERNAL',
    message: known
      ? MESSAGES[error.code]
      : 'The voice request could not be completed. Please try again.',
    retryable: known ? error.retryable : true,
  });
}
