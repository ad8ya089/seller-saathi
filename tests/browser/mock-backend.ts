import type { Page } from '@playwright/test';
import {
  dashboardFixture,
  followupDashboardFixture,
} from '../dashboard-fixtures';
import {
  confirmRequestSchema,
  sessionRequestSchema,
} from '@/lib/agent/contracts';
import type { SessionRequest } from '@/lib/agent/contracts';
import { callCopy, questionText } from '@/lib/domain/call-language';
import { followupSpeech } from '@/lib/domain/followup-speech';
import { textTurnSchema } from '@/lib/voice/events';
import type { EchoEvent } from '@/lib/voice/events';
import type { AgentState } from '@/lib/agent/contracts';
import type { CommittedPlan } from '@/lib/domain/plan';
import { spokenMoney } from '@/lib/domain/spoken-numbers';
import { spokenActionTitles } from '@/lib/domain/plan-speech';

export interface MockBackend {
  confirmation: 'success' | 'failure' | 'pending';
  saved: CommittedPlan[];
  decisions: string[];
  sessions: number;
  sessionInputs: SessionRequest[];
  release: () => void;
}
export async function installMockBackend(page: Page): Promise<MockBackend> {
  const fixture = dashboardFixture();
  let turn = 0;
  let options: SessionRequest = { lang: 'en-IN', mode: 'call' };
  let review: ReturnType<typeof followupDashboardFixture> | undefined;
  const backend: MockBackend = {
    confirmation: 'success',
    saved: [],
    decisions: [],
    sessions: 0,
    sessionInputs: [],
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
    options = sessionRequestSchema.parse(route.request().postDataJSON());
    backend.sessionInputs.push(options);
    review =
      options.mode === 'followup' && options.followupRunId
        ? followupDashboardFixture(fixture.committed, options.followupRunId)
        : undefined;
    turn = 0;
    await route.fulfill({
      json: {
        ...fixture.session,
        lang: options.lang,
        ...(review ? { initialState: review.initial } : {}),
        greeting: {
          ...fixture.session.greeting,
          text:
            review?.greeting ??
            (options.lang === 'hi-IN'
              ? 'Namaste, main aapka AI Virtual Account Manager hoon. Aaj main aapki kaise madad karun?'
              : fixture.session.greeting.text),
        },
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
    if (input.decision === 'accept')
      backend.saved = review
        ? [review.committed, fixture.committed]
        : [fixture.committed];
    await route.fulfill({
      json:
        input.decision === 'accept'
          ? (review?.saved ?? fixture.saved)
          : fixture.declined,
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
    if (review) {
      state = review.proposed;
      if (!state.followup) throw new Error('Expected review view');
      sentences = followupSpeech(state.followup, state.plan, options.lang);
      events.push({
        event: 'tool',
        data: {
          name: 'get_followup_status',
          label: 'Reviewing illustrative action progress.',
        },
      });
    } else if (turn === 1) {
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
        options.lang === 'hi-IN'
          ? 'Stock ki kami dikh rahi hai.'
          : `Sales fell from ${spokenMoney(fixture.data.seller.periods.last.sales)} to ${spokenMoney(fixture.data.seller.periods.this.sales)}, and stock shortages dominate cancellations.`,
        questionText('Q_OOS_CONFIRM', options.lang, fixture.data),
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
        options.lang === 'hi-IN'
          ? 'Stock ki baat note kar li hai.'
          : 'I have noted what you said about stock.',
        questionText('Q_RESTOCK_ETA', options.lang, fixture.data),
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
        ...spokenActionTitles(fixture.committed.plan, options.lang).map(
          (title) => `${title}.`,
        ),
        callCopy(options.lang).saveQuestion,
      ];
    }
    events.push(
      { event: 'state', data: state },
      { event: 'state', data: state },
    );
    const audioB64 = fixture.session.greeting.audioB64;
    if (audioB64 === null)
      throw new Error('The English browser fixture requires audio');
    sentences.forEach((text, idx) =>
      events.push(
        { event: 'sentence', data: { idx, text } },
        {
          event: 'audio',
          data: {
            idx,
            mime: 'audio/wav',
            b64: audioB64,
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
