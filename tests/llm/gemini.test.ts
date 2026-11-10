import { describe, expect, it, vi } from 'vitest';
import { ApiError, FinishReason, GenerateContentResponse } from '@google/genai';
import type { Content } from '@google/genai';
import { Gemini } from '@/lib/llm/gemini';
import type { GeminiTransport } from '@/lib/llm/gemini';
import { parseConfig } from '@/lib/server/config';

const settings = { ...parseConfig({}).gemini, apiKey: 'fake-test-key' };
function chunk(content: Content): GenerateContentResponse {
  const response = new GenerateContentResponse();
  response.candidates = [{ content, finishReason: FinishReason.STOP }];
  response.usageMetadata = { promptTokenCount: 12, candidatesTokenCount: 4 };
  return response;
}
describe('Gemini streaming adapter', () => {
  it('bounds a stalled primary, its retry and fallback by their own deadlines', async () => {
    vi.useFakeTimers();
    try {
      const transport = vi
        .fn<GeminiTransport>()
        .mockImplementation(async function* () {
          await new Promise(() => undefined);
        });
      const pending = new Gemini(
        { ...settings, timeoutMs: 10 },
        transport,
      ).stream(
        { system: 'rules', history: [], tools: [] },
        () => Promise.resolve(),
        new AbortController().signal,
      );
      const rejected = expect(pending).rejects.toMatchObject({
        code: 'PROVIDER_TIMEOUT',
      });
      await vi.advanceTimersByTimeAsync(1000);
      await rejected;
      expect(transport).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it('streams deltas and preserves complete signed content, empty signature parts and call IDs', async () => {
    const signed = {
      role: 'model',
      parts: [
        {
          functionCall: { name: 'read', id: 'call-1', args: {} },
          thoughtSignature: 'opaque-signature',
          partMetadata: { unknown: 'preserved' },
        },
      ],
    };
    const ending = {
      role: 'model',
      parts: [{ text: '', thoughtSignature: 'empty-text-signature' }],
    };
    const transport = vi
      .fn<GeminiTransport>()
      .mockImplementation(async function* () {
        await Promise.resolve();
        yield chunk(signed);
        yield chunk(ending);
      });
    const provider = new Gemini(settings, transport);
    const first = await provider.stream(
      {
        system: 'rules',
        history: [{ kind: 'user', text: 'hello' }],
        tools: [],
      },
      () => Promise.resolve(),
      new AbortController().signal,
    );
    expect(first.message.content[0]).toBe(signed);
    expect(first.message.content[1]).toBe(ending);
    expect(first.calls).toEqual([{ id: 'call-1', name: 'read', args: {} }]);
    await provider.stream(
      {
        system: 'rules',
        history: [
          first.message,
          {
            kind: 'tools',
            results: [{ id: 'call-1', name: 'read', response: { ok: true } }],
          },
        ],
        tools: [],
      },
      () => Promise.resolve(),
      new AbortController().signal,
    );
    const contents = transport.mock.calls[1]?.[0].contents;
    expect(contents).toEqual([
      signed,
      ending,
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call-1',
              name: 'read',
              response: { ok: true },
            },
          },
        ],
      },
    ]);
    expect(first.usage).toEqual({ input: 12, output: 4, thoughts: 0 });
  });
  it('retries one primary 5xx then calls only the configured fallback', async () => {
    const transport = vi
      .fn<GeminiTransport>()
      .mockImplementation(async function* (input) {
        await Promise.resolve();
        if (input.model === settings.model)
          throw new ApiError({ status: 503, message: 'private body' });
        yield await Promise.resolve(
          chunk({ role: 'model', parts: [{ text: 'Hello.' }] }),
        );
      });
    const text: string[] = [];
    await new Gemini(settings, transport).stream(
      { system: 'rules', history: [], tools: [] },
      (delta) => {
        text.push(delta);
        return Promise.resolve();
      },
      new AbortController().signal,
    );
    expect(transport.mock.calls.map(([input]) => input.model)).toEqual([
      settings.model,
      settings.model,
      settings.fallbackModel,
    ]);
    expect(text).toEqual(['Hello.']);
  });
  it('never retries auth or model/argument errors and sanitizes their body', async () => {
    const transport = vi
      .fn<GeminiTransport>()
      .mockImplementation(async function* () {
        await Promise.resolve();
        throw new ApiError({ status: 404, message: 'secret model response' });
      });
    await expect(
      new Gemini(settings, transport).stream(
        { system: 'rules', history: [], tools: [] },
        () => Promise.resolve(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
      message: 'Gemini rejected the request (HTTP 404)',
    });
    expect(transport).toHaveBeenCalledOnce();
  });
  it('does not replay partially delivered speech on a failed stream', async () => {
    const transport = vi
      .fn<GeminiTransport>()
      .mockImplementation(async function* () {
        yield await Promise.resolve(
          chunk({ role: 'model', parts: [{ text: 'Hello.' }] }),
        );
        throw new ApiError({ status: 503, message: 'private' });
      });
    await expect(
      new Gemini(settings, transport).stream(
        { system: 'rules', history: [], tools: [] },
        () => Promise.resolve(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(transport).toHaveBeenCalledOnce();
  });
  it('times out a stalled request and honors caller cancellation without network', async () => {
    vi.useFakeTimers();
    try {
      const transport = vi
        .fn<GeminiTransport>()
        .mockImplementation(async function* () {
          await new Promise(() => undefined);
        });
      const abort = new AbortController();
      const request = new Gemini(settings, transport).stream(
        { system: 'rules', history: [], tools: [] },
        () => Promise.resolve(),
        abort.signal,
      );
      const rejection = expect(request).rejects.toMatchObject({
        code: 'REQUEST_ABORTED',
      });
      abort.abort();
      await rejection;
      expect(transport).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
