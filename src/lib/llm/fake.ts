import { AppError } from '@/lib/errors';
import { abortable, throwIfAborted } from '@/lib/voice/abort';
import type {
  FunctionRequest,
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResult,
  TokenUsage,
} from '@/lib/llm/provider';

export interface FakeResponse {
  text?: string[];
  calls?: FunctionRequest[];
  content?: readonly unknown[];
  usage?: TokenUsage;
  error?: AppError;
  before?: () => Promise<void>;
  afterText?: (index: number) => Promise<void>;
}
export class FakeLlm implements LlmProvider {
  readonly requests: LlmRequest[] = [];
  constructor(private readonly script: readonly FakeResponse[]) {}
  async stream(
    request: LlmRequest,
    onText: (delta: string) => Promise<void>,
    signal: AbortSignal,
  ): Promise<LlmResult> {
    throwIfAborted(signal);
    const next = this.script[this.requests.length];
    this.requests.push(structuredClone(request));
    if (!next)
      throw new AppError(
        'PROVIDER_RESPONSE_INVALID',
        'Fake LLM script exhausted',
      );
    if (next.before) await abortable(next.before(), signal);
    if (next.error) throw next.error;
    for (const [index, text] of (next.text ?? []).entries()) {
      throwIfAborted(signal);
      await onText(text);
      if (next.afterText) await abortable(next.afterText(index), signal);
    }
    const message: Extract<LlmMessage, { kind: 'model' }> = {
      kind: 'model',
      content: next.content ?? [
        {
          role: 'model',
          parts: [
            ...(next.text ?? []).map((text) => ({ text })),
            ...(next.calls ?? []).map((functionCall) => ({ functionCall })),
          ],
        },
      ],
    };
    return {
      message,
      calls: next.calls ?? [],
      model: 'fake',
      firstMs: 1,
      totalMs: 2,
      usage: next.usage ?? { input: 10, output: 5, thoughts: 0 },
    };
  }
}
