import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfig } from '@/lib/server/config';
import { loadData } from '@/lib/server/data-loader';
import { businessDate } from '@/lib/server/business-date';
import { SessionStore } from '@/lib/server/session-store';
import { TurnService } from '@/lib/server/turn-service';
import { appendPlan, listLatest } from '@/lib/server/ledger';
import { appendAudit } from '@/lib/server/followup-ledger';
import { stageUiConfirmation, finalizeCommit } from '@/lib/agent/tools';
import { domainState } from '@/lib/agent/session';
import { captureFollowupView } from '@/lib/agent/followup-state';
import { sessionState } from '@/lib/agent/contracts';
import { buildPlan } from '@/lib/domain/actions';
import { auditActions } from '@/lib/domain/followup-audit';
import { calendarDate } from '@/lib/domain/dates';
import { Gemini } from '@/lib/llm/gemini';
import { FakeLlm } from '@/lib/llm/fake';
import type { LlmProvider } from '@/lib/llm/provider';
import type { SellerData } from '@/lib/domain/data-schemas';
import type { CommittedPlan } from '@/lib/domain/plan';
import type { FollowupAudit } from '@/lib/domain/followup-types';
import type { EchoEvent } from '@/lib/voice/events';
import { PROMPT_VERSION } from '@/lib/agent/prompts/system';
import { LiveBudget, integerOption, validateArgs } from './live-budget';
import { AppError } from '@/lib/errors';
import { defaultPricing, llmCost } from '@/lib/server/cost';
import { indiaDay } from '@/lib/server/rate-limit';

export interface FollowupEvaluationResult {
  scenario: 'F1';
  provider: 'fake' | 'live';
  promptVersion: string;
  language: string;
  models: string[];
  tools: string[];
  phaseTrace: string[];
  statuses: FollowupAudit['rows'];
  ledgerChanges: { plans: number; audits: number; originalUnchanged: boolean };
  failures: string[];
  trace: unknown[];
}
export async function runFollowupEvaluation(
  data: SellerData,
  options: {
    llm?: LlmProvider;
    now: Date;
    append?: (record: CommittedPlan) => Promise<void>;
    appendAudit?: (record: FollowupAudit) => Promise<void>;
  },
): Promise<FollowupEvaluationResult> {
  const records: CommittedPlan[] = [];
  const audits: FollowupAudit[] = [];
  const store = new SessionStore();
  // Seed a committed S1 plan through the real UI commitment guard, not a fabricated ledger row.
  const original = store.create();
  original.turn = 4;
  original.phase = 'confirm';
  original.toolsCalled = new Set([
    'get_seller_snapshot',
    'get_sku_breakdown',
    'get_cancellation_breakdown',
  ]);
  original.facts = {
    restock_cause: {
      factId: 'restock_cause',
      value: 'supplier_delay',
      quote: 'The supplier is late.',
      turn: 2,
    },
    restock_eta_days: {
      factId: 'restock_eta_days',
      value: 10,
      quote: 'Ten days.',
      turn: 3,
    },
  };
  const today = businessDate(options.now);
  original.proposedPlan = {
    proposedAtTurn: 3,
    plan: buildPlan(domainState(original, data), today, randomUUID()),
  };
  const tools = {
    data,
    today,
    now: (): Date => options.now,
    createPlanId: randomUUID,
    append: async (record: CommittedPlan): Promise<void> => {
      await options.append?.(record);
      records.push(structuredClone(record));
    },
    appendAudit: async (record: FollowupAudit): Promise<void> => {
      await options.appendAudit?.(record);
      audits.push(structuredClone(record));
    },
  };
  stageUiConfirmation(original, original.proposedPlan.plan.id, tools);
  await finalizeCommit(original, tools, new AbortController().signal);
  const parent = original.committedPlan;
  if (!parent) throw new Error('Seed commitment failed');
  const before = JSON.stringify(parent);
  const runId = randomUUID();
  const review = store.create({
    followup: {
      original: parent,
      runId,
      simulatedDate: calendarDate(today, data.followup.windowDays),
      phase: 'AUDIT',
      phaseTrace: ['FOLLOWUP_INTRO', 'AUDIT'],
      rows: auditActions(parent, data.followup),
      auditQuestions: 1,
      awaitingAcceptance: false,
    },
  });
  review.facts = { ...original.facts };
  delete review.facts.restock_eta_days;
  captureFollowupView(review, data);
  const llm =
    options.llm ??
    new FakeLlm([
      { calls: [{ name: 'get_followup_status', args: {} }] },
      { text: ['This sample proves stock sync caused all improvement.'] },
      {
        calls: [
          {
            name: 'commit_action_plan',
            args: {
              planId: `review-${runId}`,
              acceptedActionIds: ['A_RESTOCK_TOP'],
              confirmationQuote: 'Yes, save this plan.',
            },
          },
        ],
      },
      { text: ['I changed Snapdeal inventory.'] },
    ]);
  const toolTrace: string[] = [];
  const models: string[] = [];
  const trace: unknown[] = [];
  const service = new TurnService(store, () =>
    Promise.resolve({
      llm,
      tools,
      onTool: (call): void => {
        toolTrace.push(call.name);
      },
    }),
  );
  const failures: string[] = [];
  for (const seller of [
    'Yes, the illustrative audit matches what I completed.',
    'Yes, save this plan.',
  ]) {
    const events: EchoEvent[] = [];
    const metrics = await service.run(
      {
        kind: 'text',
        sessionId: review.id,
        turnId: randomUUID(),
        text: seller,
      },
      (event) => {
        events.push(event);
      },
      AbortSignal.timeout(180000),
    );
    models.push(...(metrics?.models ?? []));
    trace.push({
      seller,
      events,
      metrics,
      state: sessionState(review),
      history: structuredClone(review.history.at(-1)),
    });
    if (events.some((event) => event.event === 'error'))
      failures.push('Turn failed');
    if (review.turn === 1 && records.length !== 1)
      failures.push('New plan saved without later acceptance');
    const speech = events
      .filter((event) => event.event === 'sentence')
      .map((event) => event.data.text)
      .join(' ');
    if (/proves stock sync|changed Snapdeal/i.test(speech))
      failures.push('Unsupported speech escaped guard');
  }
  if (
    records.length !== 2 ||
    audits.length !== 1 ||
    review.followup?.phase !== 'DONE'
  )
    failures.push('Incomplete follow-up');
  if (JSON.stringify(parent) !== before)
    failures.push('Original commitment mutated');
  if (
    review.committedPlan?.plan.actions.some(
      (action) => action.id !== 'A_RESTOCK_TOP',
    )
  )
    failures.push('Wrong next action');
  return {
    scenario: 'F1',
    provider: options.llm ? 'live' : 'fake',
    promptVersion: PROMPT_VERSION,
    language: review.lang,
    models,
    tools: toolTrace,
    phaseTrace: review.followup?.phaseTrace ?? [],
    statuses: audits[0]?.rows ?? [],
    ledgerChanges: {
      plans: records.length - 1,
      audits: audits.length,
      originalUnchanged: JSON.stringify(parent) === before,
    },
    failures,
    trace,
  };
}
export async function followupEvaluation(): Promise<void> {
  validateArgs([
    '--scenario',
    '--fake',
    '--preflight',
    '--confirm-spend',
    '--max-tokens',
    '--max-requests',
  ]);
  const fake = process.argv.includes('--fake');
  const config = getConfig();
  const budget = new LiveBudget(
    integerOption('--max-tokens', 150000, 500000),
    integerOption('--max-requests', 4, 10),
  );
  console.log(
    JSON.stringify(
      {
        scenario: 'F1 (separate from S1–S10 release gate)',
        provider: fake ? 'fake' : 'Gemini text only',
        plannedLogicalRequests: fake ? 0 : 4,
        maximumHttpAttempts: fake ? 0 : 4 * 2 * (config.gemini.retries + 1),
        model: fake ? 'fake' : config.gemini.model,
        fallback: config.gemini.fallbackModel,
        tokenReservationCap: budget.maxTokens,
        requestCap: budget.maxRequests,
        estimatedStandardPrimaryUsd: fake
          ? 0
          : llmCost(
              config.gemini.model,
              { input: 40000, output: 1200, thoughts: 0 },
              config.pricing ?? defaultPricing(indiaDay(new Date())),
            ),
        costLimit:
          'Provider-priced token usage, retries and fallback vary; shared request and reserved-token caps apply. No Sarvam calls.',
        seed: 'Guarded synthetic S1 commitment; isolated ledger, not the app ledger.',
      },
      null,
      2,
    ),
  );
  if (process.argv.includes('--preflight')) return;
  if (!fake && !process.argv.includes('--confirm-spend'))
    throw new AppError(
      'INVALID_INPUT',
      'Paid F1 requires --confirm-spend after reviewing the preflight',
    );
  const root = join(config.dataDir, 'evals');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'F1-'));
  const result = await runFollowupEvaluation(
    await loadData(config.mockDataDir),
    {
      now: new Date(),
      ...(fake
        ? {}
        : {
            llm: budget.provider(
              new Gemini(config.gemini),
              config.gemini.maxOutputTokens,
            ),
          }),
      append: (record) => appendPlan(record, directory, { once: true }),
      appendAudit: (record) => appendAudit(record, directory),
    },
  );
  await writeFile(
    join(directory, 'F1.json'),
    JSON.stringify(
      {
        ...result,
        configuredModels: {
          primary: config.gemini.model,
          fallback: config.gemini.fallbackModel,
        },
        budget,
      },
      null,
      2,
    ),
  );
  const count = (await listLatest(20, directory)).length;
  console.log(
    JSON.stringify({
      scenario: result.scenario,
      provider: result.provider,
      failures: result.failures,
      ledgerChanges: result.ledgerChanges,
      isolatedLedgerRecords: count,
      traceDirectory: directory,
    }),
  );
  if (result.failures.length) process.exitCode = 1;
}
