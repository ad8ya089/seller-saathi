import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { parseConfig } from '@/lib/server/config';
import { SessionStore } from '@/lib/server/session-store';
import { TurnService } from '@/lib/server/turn-service';
import { GreetingCache } from '@/lib/server/greeting';
import {
  createConfirmHandler,
  createLedgerHandler,
  createSessionHandler,
  createTurnHandler,
} from '@/lib/server/agent-api';
import type { AgentServices } from '@/lib/server/agent-api';
import { appendPlan, listLatest } from '@/lib/server/ledger';
import { FakeLlm } from '@/lib/llm/fake';
import { FakeTts } from '@/lib/voice/fakes';
import { buildPlan } from '@/lib/domain/actions';
import { domainState } from '@/lib/agent/session';
import { agentStateSchema, sessionResponseSchema } from '@/lib/agent/contracts';
import { AppError } from '@/lib/errors';
import type { ToolEnvironment } from '@/lib/agent/tools';
import { publicErrorSchema } from '@/lib/voice/events';
import { fixture } from '../fixtures';
import { wavFixture } from '../voice/fixtures';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
function request(
  path: string,
  body: unknown,
  origin = 'http://localhost',
): Request {
  return new Request(`http://localhost/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
}
async function rig(
  tts = new FakeTts(wavFixture({ sampleRate: 24000 })),
): Promise<AgentServices> {
  const directory = await mkdtemp(join(tmpdir(), 'seller-api-'));
  directories.push(directory);
  const config = parseConfig({
    GEMINI_API_KEY: 'fake-gemini',
    SARVAM_API_KEY: 'fake-sarvam',
    DATA_DIR: directory,
  });
  const sessions = new SessionStore();
  const toolEnvironment: AgentServices['toolEnvironment'] = () =>
    Promise.resolve({
      data: fixture,
      settings: config,
      today: new Date('2026-11-10T00:00:00Z'),
      now: () => new Date('2026-11-10T12:00:00Z'),
      createPlanId: randomUUID,
      append: (record, signal) =>
        appendPlan(record, directory, { once: true, signal }),
    });
  return {
    config,
    sessions,
    greeting: new GreetingCache(tts),
    turns: new TurnService(sessions, async () => ({
      llm: new FakeLlm([]),
      tts,
      tools: await toolEnvironment(),
    })),
    data: () => Promise.resolve(fixture),
    toolEnvironment,
    ledger: () => listLatest(20, directory),
  };
}
function proposed(services: AgentServices): ReturnType<SessionStore['create']> {
  const session = services.sessions.create();
  session.phase = 'confirm';
  session.turn = 3;
  session.questionsAsked = ['Q_OOS_CONFIRM', 'Q_RESTOCK_ETA'];
  session.toolsCalled = new Set([
    'get_seller_snapshot',
    'get_sku_breakdown',
    'get_cancellation_breakdown',
  ]);
  session.proposedPlan = {
    plan: buildPlan(
      domainState(session, fixture),
      new Date('2026-11-10T00:00:00Z'),
      randomUUID(),
    ),
    proposedAtTurn: 3,
  };
  return session;
}
describe('agent HTTP boundaries', () => {
  it('returns a recoverable storage error without confirming a failed save, then permits retry', async () => {
    const services = await rig();
    const original = services.toolEnvironment;
    services.toolEnvironment = async (): Promise<ToolEnvironment> => ({
      ...(await original()),
      append: (): Promise<void> =>
        Promise.reject(
          new AppError('LEDGER_IO', 'private filesystem detail', true),
        ),
    });
    const session = proposed(services);
    const body = {
      sessionId: session.id,
      planId: session.proposedPlan?.plan.id,
      decision: 'accept',
    };
    const handler = createConfirmHandler(services);
    const failed = await handler(request('confirm', body));
    expect(failed.status).toBe(503);
    const failure = publicErrorSchema.parse(await failed.json());
    expect(failure).toMatchObject({
      code: 'LEDGER_IO',
      retryable: true,
    });
    expect(failure.message).toContain('not saved');
    expect(session.committedPlan).toBeUndefined();
    expect(await services.ledger()).toHaveLength(0);
    services.toolEnvironment = original;
    expect((await handler(request('confirm', body))).status).toBe(200);
    expect(await services.ledger()).toHaveLength(1);
  });
  it('creates Hindi only after its verification gate and keeps greetings separate from English', async () => {
    const tts = new FakeTts(wavFixture({ sampleRate: 24000 }));
    const services = await rig(tts);
    services.config.hinglishEnabled = true;
    const handler = createSessionHandler(services);
    const response = await handler(request('session', { lang: 'hi-IN' }));
    const hindi = sessionResponseSchema.parse(await response.json());
    expect(hindi.lang).toBe('hi-IN');
    expect(hindi.greeting.text).toContain('Namaste');
    expect(services.sessions.get(hindi.sessionId).lang).toBe('hi-IN');
    await handler(request('session', { lang: 'en-IN' }));
    expect(tts.calls.map((call) => call.lang)).toEqual(['hi-IN', 'en-IN']);
  });
  it('retains Hindi greeting text during synthesis failure without changing English failure behavior', async () => {
    const services = await rig(
      new FakeTts(wavFixture({ sampleRate: 24000 }), {
        error: new AppError('PROVIDER_UNAVAILABLE', 'private provider body'),
      }),
    );
    services.config.hinglishEnabled = true;
    const response = await createSessionHandler(services)(
      request('session', { lang: 'hi-IN' }),
    );
    expect(response.status).toBe(200);
    const body = sessionResponseSchema.parse(await response.json());
    expect(body.greeting.audioB64).toBeNull();
    expect(body.greeting.text).toContain('Namaste');
    expect(JSON.stringify(body)).not.toContain('private provider body');
  });
  it('creates server sessions, caches the AI greeting and rejects unsupported language/contracts', async () => {
    const tts = new FakeTts(wavFixture({ sampleRate: 24000 }));
    const services = await rig(tts);
    const handler = createSessionHandler(services);
    const first = await handler(
      request('session', { lang: 'en-IN', mode: 'call' }),
    );
    const body = sessionResponseSchema.parse(await first.json());
    expect(body.greeting.text).toContain('an AI assistant');
    expect(body.config.bargeIn).toBe(true);
    expect(body.snapshot.seller).toMatchObject({ name: fixture.seller.name });
    expect((await handler(request('session', { lang: 'en-IN' }))).status).toBe(
      200,
    );
    expect(tts.calls).toHaveLength(1);
    expect(services.sessions.count()).toBe(2);
    expect((await handler(request('session', { lang: 'hi-IN' }))).status).toBe(
      400,
    );
    expect(
      (
        await handler(
          request('session', { lang: 'en-IN' }, 'https://elsewhere.example'),
        )
      ).status,
    ).toBe(400);
  });
  it('does not create a session when greeting synthesis fails or credentials are absent', async () => {
    const services = await rig(
      new FakeTts(wavFixture({ sampleRate: 24000 }), {
        error: new AppError('PROVIDER_UNAVAILABLE', 'private provider body'),
      }),
    );
    const response = await createSessionHandler(services)(
      request('session', { lang: 'en-IN' }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
    expect(services.sessions.count()).toBe(0);
    services.config.providers.gemini = false;
    expect(
      (await createSessionHandler(services)(request('session', {}))).status,
    ).toBe(503);
  });
  it('requires a real session, UUID turn ID and P2-valid WAV before running an agent', async () => {
    const services = await rig();
    const handler = createTurnHandler(services);
    const session = services.sessions.create();
    expect(
      (await handler(request('turn', { sessionId: session.id, text: 'Hello' })))
        .status,
    ).toBe(400);
    expect(
      (
        await handler(
          request('turn', {
            sessionId: randomUUID(),
            text: 'Hello',
            turnId: randomUUID(),
          }),
        )
      ).status,
    ).toBe(404);
    const form = new FormData();
    form.set('sessionId', session.id);
    form.set('turnId', randomUUID());
    form.set('audio', new Blob(['invalid'], { type: 'audio/wav' }));
    expect(
      (
        await handler(
          new Request('http://localhost/api/turn', {
            method: 'POST',
            body: form,
          }),
        )
      ).status,
    ).toBe(400);
  });
  it('UI acceptance uses guarded plan ownership and eligibility and is idempotent', async () => {
    const services = await rig();
    const handler = createConfirmHandler(services);
    const session = proposed(services);
    const planId = session.proposedPlan?.plan.id ?? '';
    expect(
      (
        await handler(
          request('confirm', {
            sessionId: session.id,
            planId: randomUUID(),
            decision: 'accept',
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await handler(
          request(
            'confirm',
            { sessionId: session.id, planId, decision: 'accept' },
            'https://evil.example',
          ),
        )
      ).status,
    ).toBe(400);
    expect(await services.ledger()).toHaveLength(0);
    const accepted = await handler(
      request('confirm', { sessionId: session.id, planId, decision: 'accept' }),
    );
    expect(accepted.status).toBe(200);
    expect(agentStateSchema.parse(await accepted.json())).toMatchObject({
      phase: 'done',
      committed: true,
    });
    expect(
      (
        await handler(
          request('confirm', {
            sessionId: session.id,
            planId,
            decision: 'accept',
          }),
        )
      ).status,
    ).toBe(200);
    expect(await services.ledger()).toHaveLength(1);
    const ledger = await createLedgerHandler(services)();
    const text = await ledger.text();
    expect(text).toContain(planId);
    expect(text).not.toContain(services.config.dataDir);
    const unsafe = proposed(services);
    const first = unsafe.proposedPlan?.plan.actions[0];
    if (first) first.id = 'A_PRICE_CHECK';
    expect(
      (
        await handler(
          request('confirm', {
            sessionId: unsafe.id,
            planId: unsafe.proposedPlan?.plan.id,
            decision: 'accept',
          }),
        )
      ).status,
    ).toBe(409);
    expect(await services.ledger()).toHaveLength(1);
  });
  it('UI decline does not write, and transcripts cannot fabricate a UI marker', async () => {
    const services = await rig();
    const session = proposed(services);
    const planId = session.proposedPlan?.plan.id ?? '';
    const response = await createConfirmHandler(services)(
      request('confirm', {
        sessionId: session.id,
        planId,
        decision: 'decline',
      }),
    );
    expect(agentStateSchema.parse(await response.json()).phase).toBe(
      'recommend',
    );
    expect(session.proposedPlan).toBeUndefined();
    expect(session.lastUserText).toBe('');
    expect(await services.ledger()).toHaveLength(0);
    expect(
      (
        await createConfirmHandler(services)(
          request('confirm', {
            sessionId: session.id,
            planId,
            decision: 'accept',
            confirmationQuote: '[ui-confirm]',
          }),
        )
      ).status,
    ).toBe(400);
  });
});
