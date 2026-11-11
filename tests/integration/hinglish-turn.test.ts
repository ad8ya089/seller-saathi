import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SessionStore } from '@/lib/server/session-store';
import { TurnService } from '@/lib/server/turn-service';
import { FakeLlm } from '@/lib/llm/fake';
import { FakeStt, FakeTts } from '@/lib/voice/fakes';
import type { CommittedPlan } from '@/lib/domain/plan';
import type { EchoEvent } from '@/lib/voice/events';
import { fixture } from '../fixtures';
import { wavFixture } from '../voice/fixtures';

function rig(): {
  store: SessionStore;
  service: TurnService;
  id: string;
  llm: FakeLlm;
  stt: FakeStt;
  tts: FakeTts;
  records: CommittedPlan[];
} {
  const store = new SessionStore();
  const session = store.create({ lang: 'hi-IN' });
  const records: CommittedPlan[] = [];
  const stt = new FakeStt({ text: 'मेरी बिक्री गिर गई है।' });
  const tts = new FakeTts(wavFixture({ sampleRate: 24000 }));
  const llm = new FakeLlm([
    { calls: [{ name: 'get_seller_snapshot', args: {} }] },
    {
      calls: [
        { name: 'get_sku_breakdown', args: {} },
        { name: 'get_cancellation_breakdown', args: {} },
      ],
    },
    { text: ['Samajh gaya.'] },
    {
      calls: [
        {
          name: 'record_seller_fact',
          args: { factId: 'oos_confirmed', value: 'yes', quote: 'Haan, dono' },
        },
        {
          name: 'record_seller_fact',
          args: {
            factId: 'restock_cause',
            value: 'supplier_delay',
            quote: 'Supplier late hai',
          },
        },
      ],
    },
    { text: ['Supplier ki deri samajh aati hai.'] },
    {
      calls: [
        {
          name: 'record_seller_fact',
          args: { factId: 'restock_eta_days', value: 10, quote: 'Das din' },
        },
      ],
    },
    {
      calls: [
        {
          name: 'propose_action_plan',
          args: {
            actionIds: ['A_RESTOCK_TOP', 'A_STOCK_SYNC', 'A_PUSH_INSTOCK'],
          },
        },
      ],
    },
    { text: ['Please save the plan.'] },
    {
      calls: [
        {
          name: 'commit_action_plan',
          args: {
            planId: 's8-plan',
            acceptedActionIds: [
              'A_RESTOCK_TOP',
              'A_STOCK_SYNC',
              'A_PUSH_INSTOCK',
            ],
            confirmationQuote: 'Haan, plan save kar dijiye',
          },
        },
      ],
    },
    { text: ['The plan is saved.'] },
  ]);
  const service = new TurnService(store, () =>
    Promise.resolve({
      llm,
      stt,
      tts,
      tools: {
        data: fixture,
        today: new Date('2026-11-11T00:00:00Z'),
        now: () => new Date('2026-11-11T12:00:00Z'),
        createPlanId: () => 's8-plan',
        append: (record) => {
          records.push(structuredClone(record));
          return Promise.resolve();
        },
      },
    }),
  );
  return { store, service, id: session.id, llm, stt, tts, records };
}
describe('S8 offline conversation with unchanged recovery guards', () => {
  it('completes the same tools and eligible plan in Hinglish only after explicit later acceptance', async () => {
    const app = rig();
    const speeches: string[] = [];
    for (const [index, text] of [
      'Meri sale gir gayi hai.',
      'Haan, dono. Supplier late hai.',
      'Das din.',
      'Haan, plan save kar dijiye.',
    ].entries()) {
      const events: EchoEvent[] = [];
      await app.service.run(
        { kind: 'text', sessionId: app.id, turnId: randomUUID(), text },
        (event) => {
          events.push(event);
        },
        new AbortController().signal,
      );
      expect(events.filter((event) => event.event === 'error')).toEqual([]);
      speeches.push(
        events
          .filter((event) => event.event === 'sentence')
          .map((event) => event.data.text)
          .join(' '),
      );
      expect(app.records).toHaveLength(index === 3 ? 1 : 0);
    }
    const session = app.store.get(app.id);
    expect(session.phase).toBe('done');
    expect(speeches.at(-1)).toContain('stock mangaiye');
    expect(speeches.at(-1)).toContain('seven din');
    expect(session.questionsAsked).toEqual(['Q_OOS_CONFIRM', 'Q_RESTOCK_ETA']);
    expect(session.facts.restock_eta_days?.quote).toBe('Das din');
    expect(app.records[0]?.plan.actions.map((action) => action.id)).toEqual([
      'A_RESTOCK_TOP',
      'A_STOCK_SYNC',
      'A_PUSH_INSTOCK',
    ]);
    expect(
      speeches.every((text) =>
        /\b(hai|hain|kijiye|mein|kar|ki|ke)\b/i.test(text),
      ),
    ).toBe(true);
    expect(app.tts.calls.every((call) => call.lang === 'hi-IN')).toBe(true);
    expect(
      app.llm.requests.every((request) =>
        request.system.includes('Roman-script'),
      ),
    ).toBe(true);
  });
  it('passes the selected language to recognition and preserves the actual Devanagari evidence', async () => {
    const app = rig();
    const events: EchoEvent[] = [];
    await app.service.run(
      {
        kind: 'audio',
        wav: wavFixture(),
        sessionId: app.id,
        turnId: randomUUID(),
      },
      (event) => {
        events.push(event);
      },
      new AbortController().signal,
    );
    expect(app.stt.calls[0]?.lang).toBe('hi-IN');
    expect(
      events.find((event) => event.event === 'transcript')?.data.text,
    ).toBe('मेरी बिक्री गिर गई है।');
    expect(events.at(-1)?.event).toBe('done');
  });
});
