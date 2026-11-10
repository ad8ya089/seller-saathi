import { z } from 'zod';
import { AppError } from '@/lib/errors';
import type { FunctionRequest } from '@/lib/llm/provider';

const partialSchema = z.object({
  jsonPath: z.string().max(200),
  stringValue: z.string().max(16000).optional(),
  numberValue: z.number().optional(),
  boolValue: z.boolean().optional(),
  nullValue: z.literal('NULL_VALUE').optional(),
  willContinue: z.boolean().optional(),
});
export const functionCallSchema = z.looseObject({
  name: z.string().min(1).max(128).optional(),
  id: z.string().min(1).max(256).optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  partialArgs: z.array(partialSchema).max(50).optional(),
  willContinue: z.boolean().optional(),
});
type Call = z.infer<typeof functionCallSchema>;
interface Pending {
  call: FunctionRequest;
  open: boolean;
  strings: Map<string, string>;
}
function invalid(): never {
  throw new AppError(
    'PROVIDER_RESPONSE_INVALID',
    'Gemini returned incomplete or unsafe function arguments',
  );
}
function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  if (!/^\$\.[A-Za-z_]\w*(?:\[\d{1,2}\])?$/.test(path)) invalid();
  const tokens = path
    .slice(2)
    .split(/[\[\]]/)
    .filter(Boolean);
  const key = tokens[0];
  if (!key || ['__proto__', 'prototype', 'constructor'].includes(key))
    invalid();
  if (tokens[1] !== undefined) {
    const prior = target[key];
    const array: unknown[] = Array.isArray(prior) ? (prior as unknown[]) : [];
    array[Number(tokens[1])] = value;
    target[key] = array;
  } else target[key] = value;
}
export class FunctionCalls {
  private readonly entries: Pending[] = [];
  add(input: unknown): void {
    const parsed = functionCallSchema.safeParse(input);
    if (!parsed.success) invalid();
    const value: Call = parsed.data;
    const prior = this.entries.find(
      (entry) =>
        entry.open &&
        (value.id
          ? entry.call.id === value.id
          : !value.name || entry.call.name === value.name),
    );
    const entry = prior ?? {
      call: {
        name: value.name ?? '',
        args: {},
        ...(value.id ? { id: value.id } : {}),
      },
      open: false,
      strings: new Map<string, string>(),
    };
    if (!prior) this.entries.push(entry);
    if (this.entries.length > 12) invalid();
    if (value.name && entry.call.name !== value.name) invalid();
    const args = z.record(z.string(), z.unknown()).parse(entry.call.args);
    if (value.args) {
      if (
        Object.keys(value.args).some((key) =>
          ['__proto__', 'prototype', 'constructor'].includes(key),
        )
      )
        invalid();
      Object.assign(args, value.args);
    }
    for (const partial of value.partialArgs ?? []) {
      const values = [
        partial.stringValue,
        partial.numberValue,
        partial.boolValue,
        partial.nullValue === 'NULL_VALUE' ? null : undefined,
      ].filter((item) => item !== undefined);
      if (values.length !== 1) invalid();
      let next: unknown = values[0];
      if (typeof next === 'string') {
        next = (entry.strings.get(partial.jsonPath) ?? '') + next;
        if (typeof next === 'string' && next.length > 16000) invalid();
        if (partial.willContinue && typeof next === 'string')
          entry.strings.set(partial.jsonPath, next);
        else entry.strings.delete(partial.jsonPath);
      }
      setPath(args, partial.jsonPath, next);
    }
    entry.call.args = args;
    entry.open = value.willContinue === true || entry.strings.size > 0;
  }
  finish(): FunctionRequest[] {
    if (this.entries.some((entry) => entry.open || !entry.call.name)) invalid();
    return this.entries.map((entry) => entry.call);
  }
}
