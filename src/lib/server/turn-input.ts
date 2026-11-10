import 'server-only';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { abortable, throwIfAborted } from '@/lib/voice/abort';
import { sessionIdSchema, textTurnSchema } from '@/lib/voice/events';
import { VOICE_LIMITS } from '@/lib/voice/limits';
import { validateWav } from '@/lib/voice/wav';
import { assertSameOrigin } from '@/lib/server/same-origin';

export type EchoInput =
  | {
      kind: 'text';
      sessionId: string;
      text: string;
      turnId?: string;
      playedSentences?: number;
    }
  | {
      kind: 'audio';
      sessionId: string;
      wav: Buffer;
      turnId?: string;
      playedSentences?: number;
    };
export interface UploadLimits {
  maxBytes: number;
  maxDurationMs: number;
}
const audioFormSchema = z.strictObject({
  sessionId: sessionIdSchema,
  audio: z.instanceof(Blob),
  turnId: z.uuid().optional(),
  playedSentences: z.coerce.number().int().min(0).max(16).optional(),
});

async function limitedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  throwIfAborted(request.signal);
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new AppError('UPLOAD_TOO_LARGE', 'Request body is too large');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('INVALID_INPUT', 'Request body is required');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await abortable(reader.read(), request.signal);
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes)
        throw new AppError('UPLOAD_TOO_LARGE', 'Request body is too large');
      chunks.push(result.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function parseEchoInput(
  request: Request,
  limits: UploadLimits,
): Promise<EchoInput> {
  assertSameOrigin(request);
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.split(';')[0]?.trim().toLowerCase() === 'application/json') {
    const body = await limitedBody(request, VOICE_LIMITS.textChars * 4 + 1024);
    let value: unknown;
    try {
      value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(body),
      );
    } catch {
      throw new AppError('INVALID_INPUT', 'Request JSON is invalid');
    }
    const parsed = textTurnSchema.safeParse(value);
    if (!parsed.success)
      throw new AppError('INVALID_INPUT', 'Text request fields are invalid');
    return {
      kind: 'text',
      sessionId: parsed.data.sessionId,
      text: parsed.data.text,
      ...(parsed.data.turnId ? { turnId: parsed.data.turnId } : {}),
      ...(parsed.data.playedSentences !== undefined
        ? { playedSentences: parsed.data.playedSentences }
        : {}),
    };
  }
  if (!contentType.toLowerCase().startsWith('multipart/form-data;'))
    throw new AppError('INVALID_INPUT', 'Use JSON text or multipart WAV input');
  const body = await limitedBody(
    request,
    limits.maxBytes + VOICE_LIMITS.multipartOverheadBytes,
  );
  let form: FormData;
  try {
    form = await new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body,
    }).formData();
  } catch {
    throw new AppError('INVALID_INPUT', 'Multipart input is invalid');
  }
  if (
    [...form.keys()].length !==
      2 + Number(form.has('turnId')) + Number(form.has('playedSentences')) ||
    form.getAll('sessionId').length !== 1 ||
    form.getAll('audio').length !== 1 ||
    (form.has('turnId') && form.getAll('turnId').length !== 1) ||
    (form.has('playedSentences') && form.getAll('playedSentences').length !== 1)
  )
    throw new AppError(
      'INVALID_INPUT',
      'Supply exactly one audio file and call identifier',
    );
  const parsed = audioFormSchema.safeParse({
    sessionId: form.get('sessionId'),
    audio: form.get('audio'),
    ...(form.has('turnId') ? { turnId: form.get('turnId') } : {}),
    ...(form.has('playedSentences')
      ? { playedSentences: form.get('playedSentences') }
      : {}),
  });
  if (!parsed.success)
    throw new AppError('INVALID_INPUT', 'Audio request fields are invalid');
  if (parsed.data.audio.size > limits.maxBytes)
    throw new AppError('UPLOAD_TOO_LARGE', 'Audio file is too large');
  const wav = Buffer.from(await parsed.data.audio.arrayBuffer());
  validateWav(wav, {
    maxBytes: limits.maxBytes,
    maxDurationMs: limits.maxDurationMs,
  });
  return {
    kind: 'audio',
    sessionId: parsed.data.sessionId,
    wav,
    ...(parsed.data.turnId ? { turnId: parsed.data.turnId } : {}),
    ...(parsed.data.playedSentences !== undefined
      ? { playedSentences: parsed.data.playedSentences }
      : {}),
  };
}

export async function readJsonInput(
  request: Request,
  maxBytes = 4096,
): Promise<unknown> {
  if (
    request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  )
    throw new AppError('INVALID_INPUT', 'Send a JSON request');
  const bytes = await limitedBody(request, maxBytes);
  try {
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    return value;
  } catch {
    throw new AppError('INVALID_INPUT', 'Request JSON is invalid');
  }
}
