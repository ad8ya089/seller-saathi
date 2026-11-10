import type { Session } from '@/lib/agent/session';
import { domainState } from '@/lib/agent/session';
import { sellerSnapshot } from '@/lib/agent/snapshot';
import { sessionState } from '@/lib/agent/contracts';
import type { SessionResponse, AgentState } from '@/lib/agent/contracts';
import { buildPlan } from '@/lib/domain/actions';
import { computeDiagnosis } from '@/lib/domain/diagnosis';
import type { CommittedPlan } from '@/lib/domain/plan';
import { fixture } from './fixtures';
import { wavFixture } from './voice/fixtures';

export interface DashboardFixture {
  data: typeof fixture;
  session: SessionResponse;
  findings: AgentState;
  proposed: AgentState;
  saved: AgentState;
  declined: AgentState;
  committed: CommittedPlan;
}
export function dashboardFixture(): DashboardFixture {
  const state: Session = {
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: 0,
    lang: 'en-IN',
    mode: 'call',
    phase: 'greeting',
    turn: 0,
    questionsAsked: [],
    facts: {},
    toolsCalled: new Set(),
    hypotheses: [],
    history: [],
    lastUserText: '',
    counters: {
      sttCalls: 0,
      ttsChars: 0,
      llmCalls: 0,
      tokens: { input: 0, output: 0, thoughts: 0 },
    },
  };
  const session: SessionResponse = {
    sessionId: state.id,
    greeting: {
      text: "Hello, I'm Snapdeal's Virtual Account Manager, an AI assistant. How can I help you today?",
      audioB64: wavFixture({ sampleRate: 24000 }).toString('base64'),
      mime: 'audio/wav',
    },
    snapshot: sellerSnapshot(state, fixture),
    config: { maxUtteranceMs: 28000, maxQuestions: 3, bargeIn: false },
  };
  state.toolsCalled = new Set([
    'get_seller_snapshot',
    'get_sku_breakdown',
    'get_cancellation_breakdown',
  ]);
  state.phase = 'investigate';
  state.questionsAsked = ['Q_OOS_CONFIRM'];
  state.hypotheses = computeDiagnosis(domainState(state, fixture)).hypotheses;
  const findings = sessionState(state);
  state.facts = {
    oos_confirmed: {
      factId: 'oos_confirmed',
      value: 'yes',
      quote: 'Yes, both.',
      turn: 2,
    },
    restock_eta_days: {
      factId: 'restock_eta_days',
      value: 10,
      quote: 'Ten days.',
      turn: 3,
    },
  };
  state.questionsAsked.push('Q_RESTOCK_ETA');
  state.hypotheses = computeDiagnosis(domainState(state, fixture)).hypotheses;
  state.phase = 'confirm';
  const plan = buildPlan(
    domainState(state, fixture),
    new Date('2026-11-10T00:00:00Z'),
    'p4-fixture-plan',
  );
  state.proposedPlan = { plan, proposedAtTurn: 3 };
  const proposed = sessionState(state);
  const committed: CommittedPlan = {
    schemaVersion: 1,
    event: 'plan_committed',
    plan,
    committedAt: '2026-11-10T12:00:00Z',
    acceptedActionIds: plan.actions.map((action) => action.id),
  };
  return {
    data: fixture,
    session,
    findings,
    proposed,
    saved: { ...proposed, phase: 'done', committed: true },
    declined: { ...findings, phase: 'recommend' },
    committed,
  };
}
