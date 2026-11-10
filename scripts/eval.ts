import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getConfig } from '@/lib/server/config';
import { loadData } from '@/lib/server/data-loader';
import { SessionStore } from '@/lib/server/session-store';
import { TurnService } from '@/lib/server/turn-service';
import { appendPlan, listLatest } from '@/lib/server/ledger';
import { businessDate } from '@/lib/server/business-date';
import { Gemini } from '@/lib/llm/gemini';
import type { EchoEvent } from '@/lib/voice/events';
import type { LlmMessage } from '@/lib/llm/provider';
import { PROMPT_VERSION } from '@/lib/agent/prompts/system';
import { PERSONAS, OPENERS } from './eval-personas';
import type { Persona } from './eval-personas';
import { assertions } from './eval-assertions';
import type { EvalTurn } from './eval-assertions';
import { LiveBudget, integerOption, option, validateArgs } from './live-budget';
import { defaultPricing, llmCost } from '@/lib/server/cost';
import { indiaDay } from '@/lib/server/rate-limit';
import { AppError } from '@/lib/errors';

async function main(): Promise<void> {
  validateArgs([
    '--persona',
    '--runs',
    '--model',
    '--sim-model',
    '--max-tokens',
    '--max-requests',
    '--confirm-spend',
    '--preflight',
  ]);
  const config = getConfig();
  const selected = option('--persona');
  if (selected && !Object.hasOwn(PERSONAS, selected))
    throw new AppError(
      'INVALID_INPUT',
      'Use S1–S7, S9 or S10. S8 is deferred to P7.',
    );
  const personas = selected
    ? [selected as Persona]
    : (Object.keys(PERSONAS) as Persona[]);
  const runs = integerOption('--runs', 3, 3);
  const model = option('--model', config.gemini.model) ?? config.gemini.model;
  const simulatorModel =
    option('--sim-model', config.sellerSimModel) ?? config.sellerSimModel;
  const budget = new LiveBudget(
    integerOption('--max-tokens', 12000000, 50000000),
    integerOption('--max-requests', 600, 5000),
  );
  const planned = personas.length * runs;
  console.log(
    JSON.stringify(
      {
        preflight: 'real Gemini text-only; isolated ledger per run',
        personas,
        runs,
        plannedRuns: planned,
        primary: model,
        simulatorModel,
        compactToolHistory: config.compactToolHistory,
        expectedSuccessfulRequests: planned * 16,
        worstCaseHttpAttempts: planned * 10 * 6 * 3,
        expectedReportedTokens: planned * 60000,
        reservedTokenCeiling: budget.maxTokens,
        logicalRequestCeiling: budget.maxRequests,
        estimatedStandardPrimaryUsd: llmCost(
          model,
          { input: planned * 55000, output: planned * 1000, thoughts: 0 },
          config.pricing ?? defaultPricing(indiaDay(new Date())),
        ),
        estimateLimit:
          'Planning estimate, primary-only successful requests; fallback/retry/simulator variability excluded. Conservative token reservations and request cap bound the live run.',
        gate: '25/27 interim; original 27/30 remains pending S8 in P7',
      },
      null,
      2,
    ),
  );
  if (process.argv.includes('--preflight')) return;
  if (!process.argv.includes('--confirm-spend'))
    throw new AppError(
      'INVALID_INPUT',
      'Paid evaluation requires --confirm-spend after reviewing this preflight.',
    );
  const data = await loadData(config.mockDataDir);
  const root = join(config.dataDir, 'evals');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'run-'));
  const results: {
    persona: Persona;
    repetition: number;
    pass: boolean;
    failures: string[];
    trace: string;
  }[] = [];
  try {
    runsLoop: for (const persona of personas)
      for (let repetition = 1; repetition <= runs; repetition += 1) {
        const ledgerDir = join(directory, `${persona}-${String(repetition)}`);
        const store = new SessionStore();
        const session = store.create();
        const llm = budget.provider(
          new Gemini({ ...config.gemini, model }),
          config.gemini.maxOutputTokens,
        );
        const simulator = budget.provider(
          new Gemini({
            ...config.gemini,
            model: simulatorModel,
            fallbackModel: simulatorModel,
            retries: 0,
            temperature: 0,
            maxOutputTokens: 120,
          }),
          120,
          1,
        );
        const toolTrace: unknown[] = [];
        const simulatorResults: unknown[] = [];
        const service = new TurnService(store, () =>
          Promise.resolve({
            llm,
            compactToolHistory: config.compactToolHistory,
            onTool: (call, result): void => {
              toolTrace.push({
                call: structuredClone(call),
                result: structuredClone(result),
              });
            },
            tools: {
              data,
              settings: config,
              today: businessDate(new Date()),
              now: (): Date => new Date(),
              createPlanId: randomUUID,
              append: (record, signal): Promise<void> =>
                appendPlan(record, ledgerDir, { once: true, signal }),
            },
          }),
        );
        const trace: EvalTurn[] = [];
        const simulatorHistory: LlmMessage[] = [];
        const failures: string[] = [];
        let fatal: string | null = null;
        try {
          for (
            let index = 0;
            index < 10 && session.phase !== 'done';
            index += 1
          ) {
            const signal = AbortSignal.timeout(180000);
            let seller = index === 0 ? OPENERS[persona] : '';
            if (index > 0) {
              simulatorHistory.push({
                kind: 'user',
                text:
                  index === 0
                    ? 'Begin with your opening concern.'
                    : `KAM: ${
                        trace
                          .at(-1)
                          ?.events.filter((event) => event.event === 'sentence')
                          .map((event) => event.data.text)
                          .join(' ') ?? 'Please try again.'
                      }\nReply as the seller, one short utterance only.`,
              });
              const result = await simulator.stream(
                {
                  system: `You simulate a synthetic Snapdeal seller for a test. Stay in character: ${PERSONAS[persona]} Never act as the assistant. Do not invent extra constraints.`,
                  history: simulatorHistory,
                  tools: [],
                },
                (delta): Promise<void> => {
                  seller += delta;
                  return Promise.resolve();
                },
                signal,
              );
              simulatorHistory.push(result.message);
              simulatorResults.push({
                model: result.model,
                usage: result.usage,
                totalMs: result.totalMs,
                attempts: result.attempts,
              });
            }
            const before = session.phase;
            const events: EchoEvent[] = [];
            const metrics = await service.run(
              {
                kind: 'text',
                sessionId: session.id,
                text: seller,
                turnId: randomUUID(),
              },
              (event) => {
                events.push(event);
              },
              signal,
            );
            trace.push({
              seller,
              before,
              after: session.phase,
              events,
              history: structuredClone(session.history.at(-1) ?? null),
              metrics,
            });
            if (
              events.some(
                (event) =>
                  event.event === 'error' && event.data.code !== 'NO_SPEECH',
              )
            )
              break;
            if (persona === 'S6' && index >= 5 && !session.proposedPlan) break;
            if (persona === 'S10' && index >= 2) break;
          }
        } catch (error: unknown) {
          fatal = error instanceof AppError ? error.code : 'INTERNAL';
          failures.push(`Run stopped: ${fatal}`);
        }
        const records = await listLatest(100, ledgerDir);
        failures.push(...assertions(persona, session, trace, records, data));
        const filename = `${persona}-${String(repetition)}.json`;
        await writeFile(
          join(directory, filename),
          JSON.stringify(
            {
              persona,
              repetition,
              configuredModel: model,
              simulatorModel,
              compactToolHistory: config.compactToolHistory,
              promptVersion: PROMPT_VERSION,
              failures,
              toolTrace,
              simulatorResults,
              trace,
              questions: session.questionsAsked,
              proposedPlan: session.proposedPlan,
              acceptedActionIds: session.committedPlan?.acceptedActionIds ?? [],
              records,
              counters: session.counters,
            },
            null,
            2,
          ),
        );
        results.push({
          persona,
          repetition,
          pass: failures.length === 0,
          failures,
          trace: filename,
        });
        console.log(JSON.stringify(results.at(-1)));
        if (fatal === 'DAILY_LIMIT') break runsLoop;
      }
  } finally {
    const passes = results.filter((run) => run.pass).length;
    const summary = {
      planned,
      completed: results.length,
      passes,
      failures: results.filter((run) => !run.pass).length,
      percentage: results.length ? (100 * passes) / results.length : null,
      interimGate: planned === 27 && results.length === 27 && passes >= 25,
      originalReleaseGate: 'Pending S8/P7; 27/30 not claimed',
      budget,
      model,
      simulatorModel,
      compactToolHistory: config.compactToolHistory,
      promptVersion: PROMPT_VERSION,
      results,
    };
    await writeFile(
      join(directory, 'summary.json'),
      JSON.stringify(summary, null, 2),
    );
    console.log(`Evaluation summary: ${directory}`);
    if (
      results.length !== planned ||
      (planned === 27 ? passes < 25 : results.some((run) => !run.pass))
    )
      process.exitCode = 1;
  }
}
try {
  await main();
} catch (error: unknown) {
  console.error(
    error instanceof AppError
      ? `${error.code}: ${error.message}`
      : 'Evaluation stopped; inspect the retained private trace.',
  );
  process.exitCode = 1;
}
