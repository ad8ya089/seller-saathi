import { z } from 'zod';

export const usageSchema = z.object({
  input: z.number().int().nonnegative().default(0),
  output: z.number().int().nonnegative().default(0),
  thoughts: z.number().int().nonnegative().default(0),
});
export type TokenUsage = z.infer<typeof usageSchema>;
export interface ToolDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}
export interface FunctionRequest {
  id?: string;
  name: string;
  args: unknown;
}
export interface ToolResponse {
  id?: string;
  name: string;
  response: Record<string, unknown>;
}
// Opaque model content is owned by its provider. Never rebuild it from text.
export type LlmMessage =
  | { kind: 'user'; text: string }
  | { kind: 'model'; content: readonly unknown[] }
  | { kind: 'tools'; results: ToolResponse[] };
export interface LlmRequest {
  system: string;
  history: readonly LlmMessage[];
  tools: readonly ToolDeclaration[];
  forceTools?: boolean;
}
export interface LlmResult {
  message: Extract<LlmMessage, { kind: 'model' }>;
  calls: FunctionRequest[];
  usage: TokenUsage;
  model: string;
  attempts?: number;
  usageComplete?: boolean;
  firstMs: number;
  totalMs: number;
}
export interface LlmProvider {
  stream(
    request: LlmRequest,
    onText: (delta: string) => Promise<void>,
    signal: AbortSignal,
  ): Promise<LlmResult>;
}
