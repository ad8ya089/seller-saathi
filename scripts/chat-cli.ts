import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
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
import { PROMPT_VERSION } from '@/lib/agent/prompts/system';
import { AppError } from '@/lib/errors';

async function main(): Promise<void> {
  const config = getConfig();
  if (!config.gemini.apiKey) {
    console.error(
      'Set GEMINI_API_KEY privately in the local .env, then run npm run chat.',
    );
    process.exitCode = 1;
    return;
  }
  const index = process.argv.indexOf('--scenario');
  const scenario =
    index >= 0
      ? process.argv[index + 1]
      : process.argv
          .find((arg) => arg.startsWith('--scenario='))
          ?.split('=')[1];
  if (scenario !== undefined && scenario !== 'S1')
    throw new AppError(
      'INVALID_INPUT',
      'Only the P3 S1 seller script is supported.',
    );
  const data = await loadData();
  const sessions = new SessionStore({
    ttlMs: config.sessionTtlMs,
    maxTurns: config.sessionMaxTurns,
    maxMs: config.sessionMaxMs,
  });
  const session = sessions.create();
  const llm = new Gemini(config.gemini);
  const service = new TurnService(sessions, () =>
    Promise.resolve({
      llm,
      maxToolRounds: config.maxToolRounds,
      compactToolHistory: config.compactToolHistory,
      tools: {
        data,
        settings: config,
        today: businessDate(new Date()),
        now: () => new Date(),
        createPlanId: randomUUID,
        append: (record, signal) =>
          appendPlan(record, config.dataDir, { once: true, signal }),
      },
    }),
  );
  const trace: {
    seller: string;
    before: string;
    after: string;
    events: EchoEvent[];
    metrics: unknown;
  }[] = [];
  const readline = scenario
    ? undefined
    : createInterface({ input: stdin, output: stdout });
  const answers = {
    Q_OOS_CONFIRM: 'Yes, both. The supplier is late.',
    Q_RESTOCK_ETA: 'Maybe ten days.',
    Q_DISPATCH: 'Dispatch is on time.',
    Q_VIEWS: 'Product views are stable.',
    Q_UNDERCUT: 'No, competitors have not cut prices.',
    Q_CAPACITY: 'Yes, a small partial restock is possible.',
  } as const;
  console.log(
    `SellerSaathi | ${config.gemini.model} | prompt ${PROMPT_VERSION} | text only, real Gemini`,
  );
  const abort = new AbortController();
  const interrupt = (): void => {
    abort.abort();
    readline?.close();
  };
  process.once('SIGINT', interrupt);
  try {
    while (
      !abort.signal.aborted &&
      session.phase !== 'done' &&
      trace.length < 10
    ) {
      const lastQuestion = session.questionsAsked.at(-1);
      const scripted =
        session.phase === 'greeting' || session.phase === 'intake'
          ? 'My sales have dropped a lot this month. Can you help?'
          : session.phase === 'confirm'
            ? 'Yes, please save it.'
            : lastQuestion
              ? answers[lastQuestion]
              : 'Please review my sales.';
      const text = scenario
        ? scripted
        : await readline?.question(`[${session.phase}] You: `);
      if (!text || /^(exit|quit|\/exit)$/i.test(text.trim())) break;
      if (scenario) console.log(`You: ${text}`);
      const before = session.phase;
      const events: EchoEvent[] = [];
      const metrics = await service.run(
        { kind: 'text', sessionId: session.id, turnId: randomUUID(), text },
        (event): void => {
          events.push(event);
          if (event.event === 'sentence')
            console.log(`KAM: ${event.data.text}`);
          else if (event.event === 'tool')
            console.log(`  Tool: ${event.data.name} — ${event.data.label}`);
          else if (event.event === 'error')
            console.error(`  ${event.data.code}: ${event.data.message}`);
        },
        abort.signal,
      );
      trace.push({
        seller: text,
        before,
        after: session.phase,
        events,
        metrics,
      });
      console.log(
        `  Phase: ${session.phase} | questions: ${String(session.questionsAsked.length)}/${String(config.investigation.maxQuestions)} | ${session.hypotheses.map((entry) => `${entry.id} ${String(entry.score)} ${entry.level}`).join(', ')}`,
      );
      if (session.proposedPlan)
        console.log(
          `  Plan: ${session.proposedPlan.plan.actions.map((action) => action.id).join(', ')} | committed: ${String(Boolean(session.committedPlan))}`,
        );
      if (events.some((event) => event.event === 'error'))
        throw new AppError(
          'PROVIDER_UNAVAILABLE',
          'The conversation turn failed. Inspect the safe error above.',
        );
    }
    if (scenario) {
      const records = await listLatest(1000, config.dataDir);
      const matching = records.filter(
        (record) => record.plan.id === session.committedPlan?.plan.id,
      );
      const result = {
        scenario,
        model: config.gemini.model,
        promptVersion: PROMPT_VERSION,
        phase: session.phase,
        turns: session.turn,
        questions: session.questionsAsked,
        planId: session.committedPlan?.plan.id,
        actions: session.committedPlan?.plan.actions.map((action) => action.id),
        ledgerLinesForPlan: matching.length,
        counters: session.counters,
      };
      const directory = join(config.dataDir, 'chat');
      await mkdir(directory, { recursive: true });
      const path = join(
        directory,
        `S1-${Date.now().toString()}-${randomUUID()}.json`,
      );
      await writeFile(path, JSON.stringify({ result, trace }, null, 2));
      console.log(JSON.stringify(result, null, 2));
      console.log(`Synthetic trace: ${path}`);
      if (
        session.phase !== 'done' ||
        matching.length !== 1 ||
        session.questionsAsked.length > config.investigation.maxQuestions ||
        !session.committedPlan ||
        session.committedPlan.plan.actions.some(
          (action) => action.id === 'A_PRICE_CHECK',
        )
      )
        throw new AppError(
          'COMMIT_REJECTED',
          'S1 did not finish with one verified commitment.',
        );
    }
  } finally {
    readline?.close();
    process.removeListener('SIGINT', interrupt);
  }
}
try {
  await main();
} catch (error: unknown) {
  console.error(
    error instanceof AppError
      ? `${error.code}: ${error.message}`
      : 'INTERNAL: The chat could not complete.',
  );
  process.exitCode = 1;
}
