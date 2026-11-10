import { appendFile } from 'node:fs/promises';
import { getConfig } from '@/lib/server/config';
import { Gemini } from '@/lib/llm/gemini';
import type { LlmMessage, ToolDeclaration } from '@/lib/llm/provider';
import { AppError } from '@/lib/errors';
import { z } from 'zod';

async function main(): Promise<void> {
  const config = getConfig().gemini;
  if (!config.apiKey) {
    console.error(
      'Set GEMINI_API_KEY privately in the local .env, then run npm run smoke:gemini.',
    );
    process.exitCode = 1;
    return;
  }
  const fallback = process.argv.includes('--fallback');
  const model = fallback ? config.fallbackModel : config.model;
  const provider = new Gemini({
    ...config,
    model,
    fallbackModel: model,
    retries: 0,
  });
  const tool: ToolDeclaration = {
    name: 'get_demo_status',
    description: 'Read the synthetic demo shop status.',
    parametersJsonSchema: {
      type: 'object',
      properties: { shop: { type: 'string' } },
      required: ['shop'],
      additionalProperties: false,
    },
  };
  const system =
    'Use get_demo_status to read the demo shop. After its response, briefly tell the user its status in one short sentence.';
  const history: LlmMessage[] = [
    { kind: 'user', text: 'Please check the demo shop.' },
  ];
  const date = new Date().toISOString();
  const trace: Record<string, unknown>[] = [];
  try {
    const first = await provider.stream(
      { system, history, tools: [tool], forceTools: true },
      () => Promise.resolve(),
      new AbortController().signal,
    );
    const call = first.calls[0];
    if (first.calls.length !== 1 || call?.name !== tool.name)
      throw new AppError(
        'PROVIDER_RESPONSE_INVALID',
        'Expected one get_demo_status function call',
      );
    const args = z
      .strictObject({ shop: z.string().min(1).max(100) })
      .parse(call.args);
    const response = {
      ok: true,
      status: 'Stock review needed',
      synthetic: true,
    };
    trace.push({
      functionCall: { name: call.name, id: call.id, args },
      toolResponse: response,
      preservedContentParts: first.message.content.length,
      latencyMs: first.totalMs,
      usage: first.usage,
    });
    history.push(first.message, {
      kind: 'tools',
      results: [
        { name: call.name, ...(call.id ? { id: call.id } : {}), response },
      ],
    });
    let text = '';
    const final = await provider.stream(
      { system, history, tools: [] },
      (delta) => {
        text += delta;
        return Promise.resolve();
      },
      new AbortController().signal,
    );
    if (!text.trim() || final.calls.length)
      throw new AppError(
        'PROVIDER_RESPONSE_INVALID',
        'Expected final text after the tool response',
      );
    trace.push({
      text,
      latencyMs: final.totalMs,
      firstTextMs: final.firstMs,
      usage: final.usage,
    });
    console.log(
      JSON.stringify(
        {
          model,
          thinkingConfig: { thinkingLevel: config.thinkingLevel.toUpperCase() },
          trace,
        },
        null,
        2,
      ),
    );
    await appendFile(
      'docs/provider-notes.md',
      `\n## Gemini smoke — ${date}\n\nModel: ${model}; SDK @google/genai 3.0.0; thinkingConfig.thinkingLevel=${config.thinkingLevel.toUpperCase()}, temperature=${String(config.temperature)}, maxOutputTokens=${String(config.maxOutputTokens)}. Two real streamed requests; automatic function execution and SDK HTTP retries disabled. Complete original model Content objects, including signed/empty parts and call IDs, were returned for tool continuation. Fallback was ${fallback ? 'explicitly selected' : 'not attempted'}.\n\nSynthetic function/tool trace and observed timings/tokens:\n\n\`\`\`json\n${JSON.stringify(trace, null, 2)}\n\`\`\`\n`,
    );
  } catch (error: unknown) {
    const message =
      error instanceof AppError
        ? `${error.code}: ${error.message}`
        : 'PROVIDER_RESPONSE_INVALID: Gemini smoke failed validation';
    console.error(`${model}: ${message}`);
    await appendFile(
      'docs/provider-notes.md',
      `\n## Gemini smoke — ${date}\n\nModel ${model}; thinking ${config.thinkingLevel}; failed: ${message}. No model alias or substitution was used.\n`,
    );
    process.exitCode = 1;
  }
}
await main();
