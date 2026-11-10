import { describe, expect, it } from 'vitest';
import { appReducer, initialAppState } from '@/lib/client/app-state';
import type { AppState } from '@/lib/client/app-state';
import { initialVoiceState } from '@/lib/client/voice-state';
import { dashboardFixture } from '../dashboard-fixtures';

const fixture = dashboardFixture();
const start = (): AppState =>
  appReducer(initialAppState(), { type: 'session', session: fixture.session });
const proposed = (): AppState =>
  appReducer(start(), {
    type: 'event',
    prefix: 'turn-a',
    event: { event: 'state', data: fixture.proposed },
  });

describe('dashboard session reducer', () => {
  it('retains the actual snapshot, handles partial transcript segments and accepts optional state before transcript', () => {
    let state = start();
    expect(state.snapshot?.seller.name).toBe(fixture.data.seller.name);
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-a',
      event: { event: 'state', data: fixture.findings },
    });
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-a',
      event: {
        event: 'transcript',
        data: { text: 'Sales dropped.', sttMs: 12 },
      },
    });
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-a',
      event: { event: 'sentence', data: { idx: 1, text: 'A question?' } },
    });
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-a',
      event: { event: 'sentence', data: { idx: 0, text: 'The finding.' } },
    });
    expect(state.messages.at(-1)?.text).toBe('The finding. A question?');
    expect(state.currentQuestion).toBe('A question?');
    expect(state.agent?.hypotheses).toEqual(fixture.findings.hypotheses);
  });
  it('records tool names, preserves repeated state without duplicating facts, and never promotes proposal to saved', () => {
    let state = proposed();
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-a',
      event: {
        event: 'tool',
        data: {
          name: 'get_sku_breakdown',
          label: 'Checking stock by product.',
        },
      },
    });
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-a',
      event: { event: 'state', data: fixture.proposed },
    });
    expect(state.toolActivity.map((item) => item.name)).toEqual([
      'get_sku_breakdown',
    ]);
    expect(state.agent?.facts).toEqual(fixture.proposed.facts);
    expect(state.agent?.committed).toBe(false);
    expect(state.committedPlan).toBeNull();
  });
  it('waits for server acceptance and exact ledger details, while a failed confirmation keeps the proposal', () => {
    let state = appReducer(proposed(), {
      type: 'confirmation',
      decision: 'accept',
      status: 'pending',
    });
    expect(state.confirmation).toBe('accept');
    expect(state.agent?.committed).toBe(false);
    state = appReducer(state, {
      type: 'confirmation',
      decision: 'accept',
      status: 'failed',
    });
    expect(state.agent?.committed).toBe(false);
    state = appReducer(state, {
      type: 'confirmation',
      decision: 'accept',
      status: 'complete',
      state: fixture.saved,
    });
    expect(state.agent?.committed).toBe(true);
    expect(state.committedPlan).toBeNull();
    state = appReducer(state, {
      type: 'ledger',
      sessionId: fixture.session.sessionId,
      record: fixture.committed,
    });
    expect(state.committedPlan?.acceptedActionIds).toEqual(
      fixture.committed.acceptedActionIds,
    );
    const stale = appReducer(state, {
      type: 'event',
      prefix: 'turn-a',
      event: { event: 'state', data: fixture.proposed },
    });
    expect(stale.agent?.committed).toBe(true);
  });
  it('clears a declined proposal and handles fallback, errors, End Call and a new session', () => {
    let state = appReducer(proposed(), {
      type: 'confirmation',
      decision: 'decline',
      status: 'complete',
      state: fixture.declined,
    });
    expect(state.agent?.plan).toBeUndefined();
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-b',
      event: {
        event: 'fallback',
        data: { kind: 'tts', message: 'Browser voice fallback.' },
      },
    });
    expect(state.notice).toBe('Browser voice fallback.');
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-b',
      event: {
        event: 'error',
        data: {
          code: 'SESSION_EXPIRED',
          message: 'Start a new call.',
          retryable: false,
        },
      },
    });
    expect(state.errorCode).toBe('SESSION_EXPIRED');
    state = appReducer(state, { type: 'voice', state: initialVoiceState() });
    expect(state.snapshot).not.toBeNull();
    expect(
      appReducer(state, {
        type: 'event',
        prefix: 'old',
        event: { event: 'state', data: fixture.saved },
      }),
    ).toEqual(state);
    state = appReducer(state, {
      type: 'voice',
      state: { ...initialVoiceState(), active: true },
    });
    expect(state.snapshot).toBeNull();
    expect(state.messages).toEqual([]);
    expect(state.committedPlan).toBeNull();
    state = appReducer(state, {
      type: 'session',
      session: {
        ...fixture.session,
        sessionId: '22222222-2222-4222-8222-222222222222',
      },
    });
    expect(state.toolActivity).toEqual([]);
    expect(state.error).toBeNull();
  });
  it('rolls back unfinished server state on a failed turn and tolerates missing optional timing fields', () => {
    let state = start();
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-a',
      event: { event: 'state', data: fixture.findings },
    });
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-a',
      event: {
        event: 'done',
        data: { turn: 1, timings: { sttMs: 1, ttsFirstMs: 2, totalMs: 4 } },
      },
    });
    state = appReducer(state, { type: 'turn', prefix: 'turn-b' });
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-b',
      event: { event: 'state', data: fixture.proposed },
    });
    state = appReducer(state, {
      type: 'event',
      prefix: 'turn-b',
      event: {
        event: 'error',
        data: {
          code: 'PROVIDER_TIMEOUT',
          message: 'Please retry.',
          retryable: true,
        },
      },
    });
    expect(state.agent).toEqual(fixture.findings);
    expect(state.currentTurn).toBe(1);
    expect(state.serverTimings).toBeNull();
  });
});
