import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SessionStore } from '@/lib/server/session-store';
import { TurnService } from '@/lib/server/turn-service';
import { FakeLlm } from '@/lib/llm/fake';
import type { FakeResponse } from '@/lib/llm/fake';
import { FakeTts } from '@/lib/voice/fakes';
import { GreetingCache } from '@/lib/server/greeting';
import { parseConfig } from '@/lib/server/config';
import {
  createSessionHandler,
  createConfirmHandler,
} from '@/lib/server/agent-api';
import type { AgentServices } from '@/lib/server/agent-api';
import { sessionResponseSchema, sessionState } from '@/lib/agent/contracts';
import { executeTool } from '@/lib/agent/tools';
import type { ToolEnvironment } from '@/lib/agent/tools';
import { phaseDeclarations } from '@/lib/agent/phases';
import type { CommittedPlan } from '@/lib/domain/plan';
import type { FollowupAudit } from '@/lib/domain/followup-types';
import type { EchoEvent } from '@/lib/voice/events';
import { dashboardFixture } from '../dashboard-fixtures';
import { fixture } from '../fixtures';
import { wavFixture } from '../voice/fixtures';

export function followupRig(runId = '33333333-3333-4333-8333-333333333333'): {
  services: AgentServices;
  records: CommittedPlan[];
  audits: FollowupAudit[];
  llm: FakeLlm;
  tts: FakeTts;
  script: FakeResponse[];
} {
  const original = dashboardFixture().committed;
  const records = [structuredClone(original)];
  const audits: FollowupAudit[] = [];
  const sessions = new SessionStore();
  const tts = new FakeTts(wavFixture({ sampleRate: 24000 }));
  const script: FakeResponse[] = [
    { calls: [{ name: 'get_followup_status', args: {} }] },
    {
      text: ['Stock sync caused a guaranteed thirty two percent improvement.'],
    },
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
    { text: ['Saved to Snapdeal.'] },
  ];
  const llm = new FakeLlm(script);
  // The acceptance call is bound to the session's exact server-created proposal below.
  const toolEnvironment: AgentServices['toolEnvironment'] = () =>
    Promise.resolve({
      data: fixture,
      today: new Date('2026-11-11'),
      now: () => new Date('2026-11-11T12:00:00Z'),
      createPlanId: () => 'review-next',
      append: (record) => {
        records.push(structuredClone(record));
        return Promise.resolve();
      },
      appendAudit: (record) => {
        audits.push(structuredClone(record));
        return Promise.resolve();
      },
    });
  const services: AgentServices = {
    sessions,
    config: parseConfig({ GEMINI_API_KEY: 'fake', HINGLISH_ENABLED: 'true' }),
    greeting: new GreetingCache(tts),
    turns: new TurnService(sessions, async () => ({
      llm,
      tts,
      tools: await toolEnvironment(),
    })),
    toolEnvironment,
    data: () => Promise.resolve(fixture),
    ledger: () => Promise.resolve(records),
    lookupPlan: (id) =>
      Promise.resolve(records.find((record) => record.plan.id === id) ?? null),
    readAudit: (planId, runId) =>
      Promise.resolve(
        audits.find(
          (audit) => audit.planId === planId && audit.runId === runId,
        ) ?? null,
      ),
  };
  return { services, records, audits, llm, tts, script };
}
function request(body: unknown): Request {
  return new Request('http://localhost/api/session', {
    method: 'POST',
    headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
async function start(
  app: ReturnType<typeof followupRig>,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const response = await createSessionHandler(app.services)(
    request({
      lang: 'en-IN',
      mode: 'followup',
      planId: app.records[0]?.plan.id,
      followupRunId: '33333333-3333-4333-8333-333333333333',
      ...extra,
    }),
  );
  expect(response.status).toBe(200);
  return sessionResponseSchema.parse(await response.json()).sessionId;
}
async function turn(
  app: ReturnType<typeof followupRig>,
  id: string,
  text: string,
  extra: { turnId?: string; playedSentences?: number } = {},
): Promise<EchoEvent[]> {
  const events: EchoEvent[] = [];
  await app.services.turns.run(
    { kind: 'text', sessionId: id, text, turnId: randomUUID(), ...extra },
    (event) => {
      events.push(event);
    },
    new AbortController().signal,
  );
  return events;
}
describe('simulated Day-7 boundaries and full offline call', () => {
  it('rejects unknown, proposed-only, missing and unrelated seller plans before synthesis', async () => {
    const app = followupRig();
    for (const body of [
      { mode: 'followup' },
      { mode: 'followup', planId: 'unknown' },
      { mode: 'followup', planId: 'proposed-only' },
    ]) {
      expect(
        (await createSessionHandler(app.services)(request(body))).status,
      ).toBeGreaterThanOrEqual(400);
    }
    const first = app.records[0];
    if (!first) throw new Error('fixture');
    first.plan.sellerId = 'unrelated';
    expect(
      (
        await createSessionHandler(app.services)(
          request({ mode: 'followup', planId: first.plan.id }),
        )
      ).status,
    ).toBe(409);
    expect(app.tts.calls).toEqual([]);
  });
  it('records a separate audit, proposes one eligible action and commits only on later explicit acceptance', async () => {
    const runId = randomUUID();
    const app = followupRig(runId);
    const before = JSON.stringify(app.records[0]);
    app.script[1] = {
      text: [
        'Shall I save these new steps for review in seven days? ',
        'Restock your top sellers first, even a partial batch.',
      ],
    };
    const id = await start(app, { followupRunId: runId });
    const session = app.services.sessions.get(id);
    expect(sessionState(session)).toMatchObject({
      phase: 'AUDIT',
      questionsAsked: 1,
      committed: false,
      followup: {
        simulatedDate: '2026-11-17',
        phaseTrace: ['FOLLOWUP_INTRO', 'AUDIT'],
      },
    });
    expect(phaseDeclarations(session).map((tool) => tool.name)).toEqual([
      'get_followup_status',
    ]);
    expect(
      (
        await executeTool(
          session,
          { name: 'get_followup_status', args: { planId: 'other' } },
          await app.services.toolEnvironment(),
        )
      ).ok,
    ).toBe(false);
    const turnId = randomUUID();
    const result = await turn(app, id, 'Yes, the audit matches.', { turnId });
    expect(result.filter((event) => event.event === 'error')).toEqual([]);
    expect(session.followup?.phaseTrace).toEqual([
      'FOLLOWUP_INTRO',
      'AUDIT',
      'RE_DIAGNOSE',
      'NEXT_STEPS',
    ]);
    expect(app.audits).toHaveLength(1);
    expect(app.records).toHaveLength(1);
    expect(
      session.proposedPlan?.plan.actions.map((action) => action.id),
    ).toEqual(['A_RESTOCK_TOP']);
    expect(sessionState(session).followup?.awaitingAcceptance).toBe(true);
    expect(
      (
        await executeTool(
          session,
          { name: 'get_followup_status', args: {} },
          await app.services.toolEnvironment(),
        )
      ).ok,
    ).toBe(false);
    expect(
      result
        .filter((event) => event.event === 'sentence')
        .map((event) => event.data.text)
        .join(' '),
    ).not.toContain('guaranteed');
    const speech = result
      .filter((event) => event.event === 'sentence')
      .map((event) => event.data.text);
    expect(speech[0]).toMatch(/^Illustrative/);
    expect(speech.at(-1)).toMatch(/\?$/);
    await turn(app, id, 'Yes, the audit matches.', { turnId });
    expect(app.audits).toHaveLength(1);
    const planId = session.proposedPlan?.plan.id;
    const accepted = await turn(app, id, 'Yes, save this plan.');
    expect(accepted.filter((event) => event.event === 'error')).toEqual([]);
    expect(sessionState(session).phase).toBe('DONE');
    expect(app.records).toHaveLength(2);
    expect(app.records[1]?.plan.review?.parentPlanId).toBe(
      app.records[0]?.plan.id,
    );
    expect(JSON.stringify(app.records[0])).toBe(before);
    app.services.sessions.remove(id);
    const resumed = app.services.sessions.get(
      await start(app, { followupRunId: runId }),
    );
    expect(resumed.followup?.phase).toBe('DONE');
    expect(resumed.followup?.awaitingAcceptance).toBe(false);
    expect(resumed.committedPlan?.plan.id).toBe(planId);
  });
  it('does not accept an interrupted unheard proposal', async () => {
    const app = followupRig();
    const id = await start(app);
    await turn(app, id, 'Stock sync is not done. Restock is partial.');
    expect(
      app.audits[0]?.rows.find((row) => row.id === 'A_STOCK_SYNC'),
    ).toMatchObject({ status: 'not_done', source: 'seller_reported' });
    // No acceptance tool is exposed when a playback receipt invalidates the proposal.
    const session = app.services.sessions.get(id);
    const { applyPlaybackReceipt } = await import('@/lib/agent/interruption');
    applyPlaybackReceipt(session, 0);
    expect(session.followup?.awaitingAcceptance).toBe(false);
    expect(session.proposedPlan).toBeUndefined();
    const response = await createConfirmHandler(app.services)(
      request({ sessionId: id, planId: 'review-next', decision: 'accept' }),
    );
    expect(response.status).toBe(409);
    expect(app.records).toHaveLength(1);
  });
  it('declines without saving and resumes an unfinished audit without asking it again', async () => {
    const app = followupRig();
    const id = await start(app);
    await turn(app, id, 'Yes, the audit matches.');
    app.services.sessions.remove(id);
    const freshId = await start(app);
    const fresh = app.services.sessions.get(freshId);
    expect(fresh.followup?.phase).toBe('NEXT_STEPS');
    expect(fresh.followup?.awaitingAcceptance).toBe(false);
    expect(phaseDeclarations(fresh)).toEqual([]);
    app.script.splice(
      2,
      2,
      { text: ['Let us review the remaining steps.'] },
      { text: ['No plan is saved.'] },
    );
    await turn(app, freshId, 'Please review the next steps.');
    expect(fresh.followup?.auditQuestions).toBe(1);
    const result = await turn(app, freshId, 'No.');
    expect(result.filter((event) => event.event === 'error')).toEqual([]);
    expect(fresh.followup?.phase).toBe('DONE');
    expect(app.records).toHaveLength(1);
    expect(app.audits).toHaveLength(1);
  });
  it('offers no infeasible action, supports Hindi review and rolls back an audit write failure', async () => {
    const app = followupRig();
    const id = await start(app, { lang: 'hi-IN' });
    const result = await turn(app, id, 'Main partial restock nahi kar sakta.');
    expect(result.filter((event) => event.event === 'error')).toEqual([]);
    const current = app.services.sessions.get(id);
    expect(current.followup?.phase).toBe('DONE');
    expect(current.proposedPlan).toBeUndefined();
    expect(app.records).toHaveLength(1);
    expect(app.tts.calls.every((call) => call.lang === 'hi-IN')).toBe(true);
    const failing = followupRig();
    const environment = failing.services.toolEnvironment;
    failing.services.toolEnvironment = async (
      session,
    ): Promise<ToolEnvironment> => ({
      ...(await environment(session)),
      appendAudit: (): Promise<void> =>
        Promise.reject(new Error('disk failure')),
    });
    failing.services.turns = new TurnService(
      failing.services.sessions,
      async () => ({
        llm: failing.llm,
        tools: await failing.services.toolEnvironment(),
      }),
    );
    const failingId = await start(failing);
    const failed = await turn(failing, failingId, 'Yes, the audit matches.');
    expect(failed.some((event) => event.event === 'error')).toBe(true);
    expect(failing.services.sessions.get(failingId).followup?.phase).toBe(
      'AUDIT',
    );
    expect(
      failing.services.sessions.get(failingId).proposedPlan,
    ).toBeUndefined();
    expect(failing.records).toHaveLength(1);
  });
});
