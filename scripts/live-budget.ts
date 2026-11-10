import { z } from 'zod';
import { AppError } from '@/lib/errors';
import type { LlmProvider, LlmRequest, LlmResult } from '@/lib/llm/provider';

export function validateArgs(
  allowed: readonly string[],
  args = process.argv.slice(2),
): void {
  const booleans = new Set([
    '--confirm-spend',
    '--preflight',
    '--generate-fixtures',
    '--fixtures-only',
  ]);
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? '';
    const name = token.split('=')[0] ?? '';
    if (!allowed.includes(name) || seen.has(name))
      throw new AppError(
        'INVALID_INPUT',
        'Unknown or repeated command option; no provider calls were made',
      );
    seen.add(name);
    if (token.includes('=') && token.slice(name.length + 1).trim() === '')
      throw new AppError('INVALID_INPUT', 'Command option needs a value');
    if (booleans.has(name)) {
      if (token.includes('='))
        throw new AppError(
          'INVALID_INPUT',
          'Boolean flags do not take a value',
        );
    } else if (!token.includes('=')) {
      index += 1;
      if (!args[index] || args[index]?.startsWith('--'))
        throw new AppError('INVALID_INPUT', 'Command option needs a value');
    }
  }
}
export function option(
  name: string,
  fallback?: string,
  args = process.argv.slice(2),
): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
export function integerOption(
  name: string,
  fallback: number,
  max: number,
): number {
  return z.coerce
    .number()
    .int()
    .min(1)
    .max(max)
    .parse(option(name, String(fallback)));
}
export class LiveBudget {
  usedTokens = 0;
  requests = 0;
  constructor(
    readonly maxTokens: number,
    readonly maxRequests: number,
  ) {}
  reserve(tokens: number): void {
    if (
      this.usedTokens + tokens > this.maxTokens ||
      this.requests >= this.maxRequests
    )
      throw new AppError(
        'DAILY_LIMIT',
        'Live run token/request budget reached; stopped safely',
      );
    this.requests += 1;
    this.usedTokens += tokens;
  }
  provider(inner: LlmProvider, maxOutput: number, attempts = 3): LlmProvider {
    return {
      stream: async (
        request: LlmRequest,
        onText,
        signal,
      ): Promise<LlmResult> => {
        // UTF-8 bytes conservatively bound text tokens; reserve transport overhead
        // and all configured retry outputs. Retain reservation on failed attempts.
        const reservation =
          (Buffer.byteLength(JSON.stringify(request)) + maxOutput + 4096) *
          attempts;
        this.reserve(reservation);
        const result = await inner.stream(request, onText, signal);
        if (result.attempts === 1 && result.usageComplete === true)
          this.usedTokens +=
            result.usage.input +
            result.usage.output +
            result.usage.thoughts -
            reservation;
        // Failed HTTP attempt usage is unknown; retain the conservative reservation
        // instead of presenting reported successful usage as the entire bill.
        return result;
      },
    };
  }
}
