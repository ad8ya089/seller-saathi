// One-off verification bundle mounted into the test container; never in the image.
import { randomUUID } from 'node:crypto';
import { FakeLlm } from '@/lib/llm/fake';
import { SessionStore } from '@/lib/server/session-store';
import { TurnService } from '@/lib/server/turn-service';
import { appendPlan, listLatest } from '@/lib/server/ledger';
import { buildPlan } from '@/lib/domain/actions';
import { domainState } from '@/lib/agent/session';
import { spokenActionTitles, planSummary } from '@/lib/domain/plan-speech';
import { fixture } from '../fixtures';

const store = new SessionStore();
const session = store.create();
const planId = `p6-persistence-${randomUUID()}`;
const today = new Date('2026-11-11T00:00:00Z');
const actions = ['A_RESTOCK_TOP', 'A_STOCK_SYNC', 'A_PUSH_INSTOCK'];
const speechSession = new SessionStore().create();
speechSession.toolsCalled = new Set([
  'get_seller_snapshot',
  'get_sku_breakdown',
  'get_cancellation_breakdown',
]);
const plan = buildPlan(domainState(speechSession, fixture), today, planId);
const llm = new FakeLlm([
  { calls: [{ name: 'get_seller_snapshot', args: {} }] },
  {
    calls: [
      { name: 'get_sku_breakdown', args: {} },
      { name: 'get_cancellation_breakdown', args: {} },
    ],
  },
  {
    text: [
      'Sales fell from two lakh rupees to one lakh thirty five thousand rupees, and stock shortages dominate cancellations.',
    ],
  },
  {
    calls: [
      {
        name: 'record_seller_fact',
        args: { factId: 'oos_confirmed', value: 'yes', quote: 'Yes, both' },
      },
      {
        name: 'record_seller_fact',
        args: {
          factId: 'restock_cause',
          value: 'supplier_delay',
          quote: 'The supplier is late',
        },
      },
    ],
  },
  { text: ['Understood.'] },
  {
    calls: [
      {
        name: 'record_seller_fact',
        args: { factId: 'restock_eta_days', value: 10, quote: 'Ten days' },
      },
    ],
  },
  { calls: [{ name: 'propose_action_plan', args: { actionIds: actions } }] },
  { text: spokenActionTitles(plan).map((text) => `${text}. `) },
  {
    calls: [
      {
        name: 'commit_action_plan',
        args: {
          planId,
          acceptedActionIds: actions,
          confirmationQuote: 'Yes, please save it.',
        },
      },
    ],
  },
  { text: [planSummary(plan)] },
]);
const service = new TurnService(store, () =>
  Promise.resolve({
    llm,
    tools: {
      data: fixture,
      today,
      now: () => today,
      createPlanId: () => planId,
      append: (record, signal) =>
        appendPlan(record, '/data', { once: true, signal }),
    },
  }),
);
for (const text of [
  'My sales dropped.',
  'Yes, both. The supplier is late.',
  'Ten days.',
  'Yes, please save it.',
]) {
  await service.run(
    { kind: 'text', sessionId: session.id, turnId: randomUUID(), text },
    () => undefined,
    AbortSignal.timeout(10000),
  );
}
const records = await listLatest(100, '/data');
if (
  session.phase !== 'done' ||
  records.filter((r) => r.plan.id === planId).length !== 1
)
  throw new Error('Guarded synthetic commitment failed');
console.log(
  JSON.stringify({
    planId,
    committed: true,
    followUpDate: session.committedPlan?.plan.followUpDate,
    fakeProviders: true,
  }),
);
