import { healthResponseSchema } from '@/lib/server/health';
import { PROMPT_VERSION } from '@/lib/agent/prompts/system';
import { defaultPricing, llmCost } from '@/lib/server/cost';
import { indiaDay } from '@/lib/server/rate-limit';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname, platform, release, cpus } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getConfig } from '@/lib/server/config';
import { operationalTurnSchema, percentile } from '@/lib/server/metrics';
import { sessionResponseSchema } from '@/lib/agent/contracts';
import { createSarvamProviders } from '@/lib/voice/sarvam';
import { validateWav } from '@/lib/voice/wav';
import { SseParser } from '@/lib/client/sse-parser';
import { integerOption, option, validateArgs } from './live-budget';
import { pcm16k, VOICE_TEXTS } from './voice-fixtures';
import { AppError } from '@/lib/errors';

async function main(): Promise<void> {
  validateArgs([
    '--count',
    '--base-url',
    '--region',
    '--max-tokens',
    '--generate-fixtures',
    '--fixtures-only',
    '--confirm-spend',
    '--preflight',
  ]);
  const config = getConfig();
  const pricing = config.pricing ?? defaultPricing(indiaDay(new Date()));
  const count = integerOption('--count', 20, 20);
  const maxTokens = integerOption('--max-tokens', 500000, 5000000);
  const base = new URL(
    z.url().parse(option('--base-url', 'http://localhost:3000')),
  );
  if (
    base.username ||
    base.password ||
    !['http:', 'https:'].includes(base.protocol)
  )
    throw new AppError(
      'INVALID_INPUT',
      'Use an HTTP base URL without embedded credentials',
    );
  const generate = process.argv.includes('--generate-fixtures');
  const directory = join('tests', 'fixtures', 'voice');
  const filenames = VOICE_TEXTS.map(
    (_text, index) => `seller-${String(index + 1).padStart(2, '0')}.wav`,
  );
  const missing: number[] = [];
  for (let i = 0; i < count; i += 1) {
    try {
      await access(join(directory, filenames[i] ?? ''));
    } catch {
      missing.push(i);
    }
  }
  console.log(
    JSON.stringify(
      {
        preflight: 'real Sarvam STT → Gemini tools → Sarvam TTS',
        count,
        base: base.origin,
        missingFixtures: missing.length,
        sourceTtsCallsIfGenerate: generate ? missing.length : 0,
        pipeline: {
          sttCalls: count,
          expectedLlmRequests: count * 4,
          worstCaseLlmHttpAttempts: count * 5 * 3,
          expectedReplyTtsCalls: count * 2,
          greetingAndCacheColdCalls: 7,
        },
        expectedReportedInputTokens: count * 11000,
        expectedStandardPrimaryLlmUsd: llmCost(
          config.gemini.model,
          { input: count * 11000, output: count * 100, thoughts: 0 },
          pricing,
        ),
        speechCost:
          'Computed from measured audio seconds and characters after execution; no placeholder bill',
        maxReportedTokens: maxTokens,
        measurement:
          'request send → first actual response audio SSE receipt; excludes VAD hangover, filler and device playback. Server stages use performance.now().',
      },
      null,
      2,
    ),
  );
  if (process.argv.includes('--preflight')) return;
  if (!process.argv.includes('--confirm-spend'))
    throw new AppError(
      'INVALID_INPUT',
      'Paid benchmark requires --confirm-spend after preflight approval.',
    );
  if (missing.length && !generate)
    throw new AppError(
      'INVALID_INPUT',
      'Generate missing synthetic fixtures once with --generate-fixtures --confirm-spend.',
    );
  if (!process.argv.includes('--fixtures-only')) {
    const response = await fetch(new URL('/api/health', base));
    const health = healthResponseSchema.parse(await response.json());
    if (!health.ok || !health.providers.gemini || !health.providers.sarvam)
      throw new AppError(
        'PROVIDER_CONFIG',
        'The benchmark server must have real Gemini and Sarvam configured',
      );
  }
  if (generate && missing.length) {
    await mkdir(directory, { recursive: true });
    const tts = createSarvamProviders(config.sarvam).tts;
    for (const index of missing) {
      const text = VOICE_TEXTS[index];
      if (!text) continue;
      const result = await tts.synthesize(
        text,
        'en-IN',
        AbortSignal.timeout(15000),
      );
      const wav = pcm16k(result.wav);
      const info = validateWav(wav);
      if (info.durationMs < 3000 || info.durationMs > 8000)
        throw new AppError(
          'INVALID_AUDIO',
          `Fixture ${String(index + 1)} outside 3–8 seconds; retained no invalid fixture`,
        );
      await writeFile(join(directory, filenames[index] ?? ''), wav, {
        flag: 'wx',
      });
    }
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify(
        {
          synthetic: true,
          model: config.sarvam.tts.model,
          speaker: config.sarvam.tts.speaker,
          created: new Date().toISOString(),
          sampleRate: 16000,
          fixtures: VOICE_TEXTS.slice(0, count).map((text, index) => ({
            file: filenames[index],
            text,
          })),
        },
        null,
        2,
      ) + '\n',
    );
  }
  if (process.argv.includes('--fixtures-only')) return;
  const reports: object[] = [];
  const stages: Record<string, number[]> = Object.fromEntries(
    [
      'sttMs',
      'llmFirstMs',
      'llmTotalMs',
      'ttsFirstMs',
      'firstAudioMs',
      'totalMs',
    ].map((name) => [name, []]),
  );
  let tokens = 0;
  let failure: { code: string; message: string; fixture: number } | null = null;
  let currentFixture = 0;
  const headers = {
    'Content-Type': 'application/json',
    Origin: base.origin,
    ...(config.demoAccessCode
      ? { 'x-demo-access-code': config.demoAccessCode }
      : {}),
  };
  try {
    for (let index = 0; index < count; index += 1) {
      currentFixture = index + 1;
      // Reserve the observed P3 findings upper estimate before another request.
      if (tokens + 50000 > maxTokens)
        throw new AppError('DAILY_LIMIT', 'Benchmark token budget reached');
      const response = await fetch(new URL('/api/session', base), {
        method: 'POST',
        headers,
        body: JSON.stringify({ lang: 'en-IN', mode: 'call' }),
      });
      if (!response.ok)
        throw new AppError(
          'PROVIDER_UNAVAILABLE',
          `Session HTTP ${String(response.status)}`,
        );
      const session = sessionResponseSchema.parse(await response.json());
      try {
        const wav = await readFile(join(directory, filenames[index] ?? ''));
        validateWav(wav);
        const form = new FormData();
        form.set('sessionId', session.sessionId);
        form.set('turnId', randomUUID());
        form.set(
          'audio',
          new Blob([new Uint8Array(wav)], { type: 'audio/wav' }),
          'synthetic.wav',
        );
        const started = performance.now();
        const stream = await fetch(new URL('/api/turn', base), {
          method: 'POST',
          headers: {
            Origin: base.origin,
            ...(config.demoAccessCode
              ? { 'x-demo-access-code': config.demoAccessCode }
              : {}),
          },
          body: form,
          signal: AbortSignal.timeout(180000),
        });
        if (!stream.ok || !stream.body)
          throw new AppError(
            'PROVIDER_UNAVAILABLE',
            `Turn HTTP ${String(stream.status)}`,
          );
        let completed = false;
        const parser = new SseParser();
        const decoder = new TextDecoder();
        const events: { event: string; atMs: number }[] = [];
        for await (const chunk of stream.body)
          for (const event of parser.push(
            decoder.decode(chunk, { stream: true }),
          )) {
            events.push({
              event: event.event,
              atMs: performance.now() - started,
            });
            if (event.event === 'done') completed = true;
            if (event.event === 'error')
              throw new AppError(event.data.code, event.data.message);
          }
        for (const event of [
          ...parser.push(decoder.decode()),
          ...parser.flush(),
        ]) {
          if (event.event === 'done') completed = true;
          if (event.event === 'error')
            throw new AppError(event.data.code, event.data.message);
        }
        if (!completed)
          throw new AppError(
            'STREAM_INVALID',
            'Benchmark stream disconnected before DONE',
          );
        const observed = await fetch(
          new URL(`/api/metrics?sessionId=${session.sessionId}`, base),
          { headers },
        );
        const record = operationalTurnSchema.parse(await observed.json());
        tokens +=
          record.metrics.tokens.input +
          record.metrics.tokens.output +
          record.metrics.tokens.thoughts;
        for (const name of Object.keys(stages)) {
          const value =
            name === 'firstAudioMs'
              ? events.find((event) => event.event === 'audio')?.atMs
              : record.metrics[name as keyof typeof record.metrics];
          if (typeof value === 'number' && value > 0) stages[name]?.push(value);
        }
        const modelIds = [...new Set(record.metrics.models)];
        const llmUsd =
          record.metrics.usageComplete && modelIds.length === 1
            ? llmCost(modelIds[0] ?? '', record.metrics.tokens, pricing)
            : null;
        const durationSeconds = validateWav(wav).durationMs / 1000;
        const sttRate = pricing.stt[record.metrics.providerModels?.stt ?? ''];
        const ttsRate = pricing.tts[record.metrics.providerModels?.tts ?? ''];
        reports.push({
          fixture: filenames[index],
          record,
          events,
          observedComponentEstimates: {
            llmUsd,
            sttInr:
              sttRate === undefined ? null : (durationSeconds * sttRate) / 60,
            ttsInr:
              ttsRate === undefined
                ? null
                : (record.metrics.ttsChars * ttsRate) / 1000,
          },
          pricing,
        });
        console.log(
          JSON.stringify({
            completed: index + 1,
            firstAudioMs: events.find((event) => event.event === 'audio')?.atMs,
          }),
        );
      } finally {
        await fetch(new URL('/api/session', base), {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ sessionId: session.sessionId }),
        });
      }
    }
  } catch (error: unknown) {
    failure = {
      code: error instanceof AppError ? error.code : 'INTERNAL',
      message:
        error instanceof AppError
          ? error.message
          : 'Benchmark transport failed',
      fixture: currentFixture,
    };
    throw error;
  } finally {
    const output = join(config.dataDir, 'bench');
    await mkdir(output, { recursive: true });
    const path = join(output, `latency-${Date.now().toString()}.json`);
    await writeFile(
      path,
      JSON.stringify(
        {
          created: new Date().toISOString(),
          promptVersion: PROMPT_VERSION,
          failure,
          machine: hostname(),
          cpu: cpus()[0]?.model,
          os: `${platform()} ${release()}`,
          node: process.version,
          region: option('--region', 'not supplied'),
          network: ['localhost', '127.0.0.1'].includes(base.hostname)
            ? 'local'
            : 'public',
          base: base.origin,
          models: {
            gemini: config.gemini.model,
            fallback: config.gemini.fallbackModel,
            stt: config.sarvam.stt.model,
            tts: config.sarvam.tts.model,
          },
          tokens,
          completed: reports.length,
          planned: count,
          estimatedCost: null,
          costUnavailableReason:
            'Failed-attempt usage and exchange rate unavailable; successful component usage retained.',
          summary: Object.fromEntries(
            Object.entries(stages).map(([name, values]) => [
              name,
              {
                n: values.length,
                p50: percentile(values, 0.5),
                p95: percentile(values, 0.95),
              },
            ]),
          ),
          reports,
        },
        null,
        2,
      ),
    );
    console.log(`Private benchmark: ${path}`);
  }
}
try {
  await main();
} catch (error: unknown) {
  console.error(
    error instanceof AppError
      ? `${error.code}: ${error.message}`
      : 'Benchmark stopped; inspect private results.',
  );
  process.exitCode = 1;
}
