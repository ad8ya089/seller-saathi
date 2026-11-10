import 'server-only';
import {
  FinishReason,
  ApiError,
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
} from '@google/genai';
import type {
  Content,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { abortable, throwIfAborted, waitForRetry } from '@/lib/voice/abort';
import { FunctionCalls, functionCallSchema } from '@/lib/llm/function-calls';
import type {
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResult,
} from '@/lib/llm/provider';
import type { AppConfig } from '@/lib/server/config';

export type GeminiTransport = (
  input: GenerateContentParameters,
) => AsyncIterable<GenerateContentResponse>;
const contentSchema = z.looseObject({
  role: z.literal('model'),
  parts: z.array(
    z.looseObject({
      text: z.string().optional(),
      thought: z.boolean().optional(),
      functionCall: functionCallSchema.optional(),
    }),
  ),
});
const usageMetadataSchema = z.looseObject({
  promptTokenCount: z.number().int().nonnegative().optional(),
  candidatesTokenCount: z.number().int().nonnegative().optional(),
  thoughtsTokenCount: z.number().int().nonnegative().optional(),
});
const THINKING = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
} as const;

function contents(history: readonly LlmMessage[]): Content[] {
  return history.flatMap((message): Content[] => {
    if (message.kind === 'user')
      return [{ role: 'user', parts: [{ text: message.text }] }];
    if (message.kind === 'tools')
      return [
        {
          role: 'user',
          parts: message.results.map((result) => ({
            functionResponse: result,
          })),
        },
      ];
    return message.content.map((original): Content => {
      if (!contentSchema.safeParse(original).success)
        throw new AppError(
          'PROVIDER_RESPONSE_INVALID',
          'Stored Gemini content is invalid',
        );
      return original as Content;
    });
  });
}
function errorStatus(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}
function publicError(error: unknown, timedOut: boolean): AppError {
  if (error instanceof AppError && error.code !== 'REQUEST_ABORTED')
    return error;
  if (timedOut)
    return new AppError(
      'PROVIDER_TIMEOUT',
      'Gemini did not respond before the deadline',
      true,
    );
  const status = errorStatus(error);
  if (status === 401 || status === 403)
    return new AppError(
      'PROVIDER_AUTH',
      `Gemini rejected the credentials (HTTP ${String(status)})`,
    );
  if (status !== null && status < 500)
    return new AppError(
      'PROVIDER_REJECTED',
      `Gemini rejected the request (HTTP ${String(status)})`,
    );
  return new AppError('PROVIDER_UNAVAILABLE', 'Gemini is unavailable', true);
}
export class Gemini implements LlmProvider {
  constructor(
    private readonly settings: AppConfig['gemini'],
    private readonly transport?: GeminiTransport,
  ) {}
  async stream(
    request: LlmRequest,
    onText: (delta: string) => Promise<void>,
    signal: AbortSignal,
  ): Promise<LlmResult> {
    if (!this.settings.apiKey)
      throw new AppError(
        'PROVIDER_CONFIG',
        'Set GEMINI_API_KEY privately in the local .env',
      );
    throwIfAborted(signal);
    const started = performance.now();
    const models = [
      ...Array.from(
        { length: Math.min(1, this.settings.retries) + 1 },
        () => this.settings.model,
      ),
      ...(this.settings.fallbackModel !== this.settings.model
        ? [this.settings.fallbackModel]
        : []),
    ];
    let delivered = false;
    for (const [attempt, model] of models.entries()) {
      const deadline = new AbortController();
      const timer = setTimeout(() => {
        deadline.abort();
      }, this.settings.timeoutMs);
      const combined = AbortSignal.any([signal, deadline.signal]);
      try {
        const input: GenerateContentParameters = {
          model,
          contents: contents(request.history),
          config: {
            systemInstruction: request.system,
            abortSignal: combined,
            httpOptions: {
              retryOptions: { attempts: 1 },
            },
            maxOutputTokens: this.settings.maxOutputTokens,
            temperature: this.settings.temperature,
            thinkingConfig: {
              thinkingLevel: THINKING[this.settings.thinkingLevel],
              includeThoughts: false,
            },
            automaticFunctionCalling: { disable: true },
            tools: request.tools.length
              ? [{ functionDeclarations: [...request.tools] }]
              : [],
            toolConfig: {
              functionCallingConfig: {
                mode: request.tools.length
                  ? request.forceTools
                    ? FunctionCallingConfigMode.ANY
                    : FunctionCallingConfigMode.AUTO
                  : FunctionCallingConfigMode.NONE,
              },
            },
          },
        };
        const transport = this.transport ?? this.defaultTransport();
        const iterator = transport(input)[Symbol.asyncIterator]();
        const original: unknown[] = [];
        const calls = new FunctionCalls();
        let firstMs = 0;
        let usage = { input: 0, output: 0, thoughts: 0 };
        let usageComplete = false;
        let finished = false;
        try {
          for (;;) {
            const step = await abortable(iterator.next(), combined);
            if (step.done) break;
            const response = step.value;
            if (response.usageMetadata) {
              const metadata = usageMetadataSchema.parse(
                response.usageMetadata,
              );
              usageComplete =
                metadata.promptTokenCount !== undefined &&
                metadata.candidatesTokenCount !== undefined;
              usage = {
                input: metadata.promptTokenCount ?? 0,
                output: metadata.candidatesTokenCount ?? 0,
                thoughts: metadata.thoughtsTokenCount ?? 0,
              };
            }
            const candidate = response.candidates?.[0];
            if (candidate?.finishReason) {
              if (candidate.finishReason !== FinishReason.STOP)
                throw new AppError(
                  'PROVIDER_RESPONSE_INVALID',
                  'Gemini did not complete its response',
                );
              finished = true;
            }
            const content = candidate?.content;
            if (!content) continue;
            if (!contentSchema.safeParse(content).success)
              throw new AppError(
                'PROVIDER_RESPONSE_INVALID',
                'Gemini returned invalid content',
              );
            // Preserve the original objects, including unknown fields and empty
            // signed parts, exactly as the SDK chat-history implementation does.
            original.push(content);
            for (const part of content.parts ?? []) {
              if (part.functionCall) calls.add(part.functionCall);
              if (part.text && !part.thought) {
                if (!firstMs) firstMs = performance.now() - started;
                delivered = true;
                await onText(part.text);
                throwIfAborted(combined);
              }
            }
          }
        } finally {
          // Returning a stuck async generator can itself block; cancellation is
          // already passed to the SDK, so observe cleanup without awaiting it.
          void iterator.return?.().catch(() => undefined);
        }
        if (!finished || !original.length)
          throw new AppError(
            'PROVIDER_RESPONSE_INVALID',
            'Gemini returned an incomplete response',
          );
        return {
          message: { kind: 'model', content: original },
          calls: calls.finish(),
          usage,
          model,
          attempts: attempt + 1,
          usageComplete: usageComplete && attempt === 0,
          firstMs,
          totalMs: performance.now() - started,
        };
      } catch (error: unknown) {
        throwIfAborted(signal);
        const timedOut =
          deadline.signal.aborted ||
          (error instanceof Error && error.name === 'TimeoutError');
        const failure = publicError(error, timedOut);
        failure.providerAttempts = attempt + 1;
        const retryable = timedOut || (errorStatus(error) ?? 0) >= 500;
        if (!retryable || delivered || attempt === models.length - 1)
          throw failure;
        await waitForRetry(100, signal);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new AppError('PROVIDER_UNAVAILABLE', 'Gemini is unavailable', true);
  }
  private defaultTransport(): GeminiTransport {
    const apiKey = this.settings.apiKey;
    if (!apiKey)
      throw new AppError('PROVIDER_CONFIG', 'Gemini is not configured');
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { retryOptions: { attempts: 1 } },
    });
    return async function* (input): AsyncGenerator<GenerateContentResponse> {
      const stream = await client.models.generateContentStream(input);
      yield* stream;
    };
  }
}
