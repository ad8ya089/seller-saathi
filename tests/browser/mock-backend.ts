import type { Page } from '@playwright/test';
import { dashboardFixture } from '../dashboard-fixtures';
import { confirmRequestSchema } from '@/lib/agent/contracts';
import { textTurnSchema } from '@/lib/voice/events';
import type { EchoEvent } from '@/lib/voice/events';
import type { AgentState } from '@/lib/agent/contracts';
import type { CommittedPlan } from '@/lib/domain/plan';
import { spokenMoney } from '@/lib/domain/spoken-numbers';
import { spokenActionTitles } from '@/lib/domain/plan-speech';
import { QUESTION_BANK } from '@/lib/domain/questions';

export interface MockBackend {
  confirmation: 'success' | 'failure' | 'pending';
  saved: CommittedPlan[];
  decisions: string[];
  sessions: number;
  release: () => void;
}
export async function installMockBackend(page: Page): Promise<MockBackend> {
  const fixture = dashboardFixture();
  let turn = 0;
  const backend: MockBackend = {
    confirmation: 'success',
    saved: [],
    decisions: [],
    sessions: 0,
    release: (): void => undefined,
  };
  // These interceptors and browser API fakes exist only in the test runner.
  // The production application has no fake-provider flag, route or provider selection.
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: (): Promise<MediaStream> =>
        Promise.reject(
          new DOMException('Test microphone denial', 'NotAllowedError'),
        ),
    });
  });
  await page.route('**/api/session', async (route): Promise<void> => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    backend.sessions++;
    turn = 0;
    await route.fulfill({
      json: {
        ...fixture.session,
        sessionId:
          backend.sessions === 1
            ? fixture.session.sessionId
            : '22222222-2222-4222-8222-222222222222',
      },
    });
  });
  await page.route('**/api/ledger', async (route): Promise<void> => {
    await route.fulfill({ json: backend.saved });
  });
  await page.route('**/api/confirm', async (route): Promise<void> => {
    const input = confirmRequestSchema.parse(route.request().postDataJSON());
    backend.decisions.push(input.decision);
    if (backend.confirmation === 'pending')
      await new Promise<void>((resolve) => {
        backend.release = resolve;
      });
    if (backend.confirmation === 'failure') {
      await route.fulfill({
        status: 409,
        json: {
          code: 'COMMIT_REJECTED',
          message: 'The plan was not saved. Please review it.',
          retryable: false,
        },
      });
      return;
    }
    if (input.decision === 'accept') backend.saved = [fixture.committed];
    await route.fulfill({
      json: input.decision === 'accept' ? fixture.saved : fixture.declined,
    });
  });
  await page.route('**/api/turn', async (route): Promise<void> => {
    const input = textTurnSchema.parse(route.request().postDataJSON());
    turn++;
    const events: EchoEvent[] = [
      { event: 'transcript', data: { text: input.text, sttMs: 0 } },
    ];
    let state: AgentState;
    let sentences: string[];
    if (turn === 1) {
      for (const [name, label] of [
        ['get_seller_snapshot', 'Checking your numbers.'],
        ['get_sku_breakdown', 'Checking stock by product.'],
        ['get_cancellation_breakdown', 'Checking cancellation reasons.'],
      ]) {
        if (name && label)
          events.push({ event: 'tool', data: { name, label } });
      }
      state = fixture.findings;
      sentences = [
        `Sales fell from ${spokenMoney(fixture.data.seller.periods.last.sales)} to ${spokenMoney(fixture.data.seller.periods.this.sales)}, and stock shortages dominate cancellations.`,
        QUESTION_BANK.Q_OOS_CONFIRM.text,
      ];
    } else if (turn === 2) {
      events.push({
        event: 'tool',
        data: {
          name: 'record_seller_fact',
          label: 'Recording what you told me.',
        },
      });
      state = {
        ...fixture.findings,
        questionsAsked: fixture.proposed.questionsAsked,
        hypotheses: fixture.proposed.hypotheses,
        facts: fixture.proposed.facts.filter(
          (fact) => fact.factId !== 'restock_eta_days',
        ),
      };
      sentences = [
        'I have noted what you said about stock.',
        QUESTION_BANK.Q_RESTOCK_ETA.text,
      ];
    } else {
      events.push({
        event: 'tool',
        data: {
          name: 'propose_action_plan',
          label: 'Preparing your recovery plan.',
        },
      });
      state = fixture.proposed;
      sentences = [
        ...spokenActionTitles(fixture.committed.plan).map(
          (title) => `${title}.`,
        ),
        'Shall I save this plan?',
      ];
    }
    events.push(
      { event: 'state', data: state },
      { event: 'state', data: state },
    );
    sentences.forEach((text, idx) =>
      events.push(
        { event: 'sentence', data: { idx, text } },
        {
          event: 'audio',
          data: {
            idx,
            mime: 'audio/wav',
            b64: fixture.session.greeting.audioB64,
          },
        },
      ),
    );
    events.push({
      event: 'done',
      data: { turn, timings: { sttMs: 0, ttsFirstMs: 0, totalMs: 0 } },
    });
    await route.fulfill({
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
      body: events
        .map(
          (event) =>
            `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
        )
        .join(''),
    });
  });
  return backend;
}
