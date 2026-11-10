import { describe, expect, it } from 'vitest';
import { SessionStore } from '@/lib/server/session-store';
import { askQuestion, phaseDeclarations, transition } from '@/lib/agent/phases';
import { cloneSession, domainState, trimHistory } from '@/lib/agent/session';
import { fixture } from '../fixtures';

describe('server phase authority', () => {
  it('keeps intake until the seller has identified a business problem', () => {
    const session = new SessionStore().create();
    session.phase = 'intake';
    session.lastUserText = 'Hello there.';
    expect(phaseDeclarations(session)).toEqual([]);
    expect(() => {
      transition(session, 'findings');
    }).toThrow();
    session.lastUserText = 'My sales have dropped this month.';
    expect(phaseDeclarations(session).map((tool) => tool.name)).toEqual([
      'get_seller_snapshot',
    ]);
    transition(session, 'findings');
  });
  it('never exposes commit before confirm or recommendation before investigation', () => {
    const session = new SessionStore().create();
    for (const phase of [
      'greeting',
      'intake',
      'findings',
      'investigate',
      'recommend',
    ] as const) {
      session.phase = phase;
      expect(phaseDeclarations(session).map((tool) => tool.name)).not.toContain(
        'commit_action_plan',
      );
      if (phase !== 'recommend')
        expect(
          phaseDeclarations(session).map((tool) => tool.name),
        ).not.toContain('propose_action_plan');
    }
    expect(() => {
      transition(session, 'commit');
    }).toThrow();
  });
  it('requires snapshot and both detail tools before asking or leaving findings', () => {
    const session = new SessionStore().create();
    session.phase = 'findings';
    session.toolsCalled.add('get_seller_snapshot');
    session.toolsCalled.add('get_sku_breakdown');
    expect(() => {
      transition(session, 'investigate');
    }).toThrow();
    expect(() => {
      askQuestion(session, 'Q_OOS_CONFIRM', domainState(session, fixture));
    }).toThrow();
    session.toolsCalled.add('get_cancellation_breakdown');
    transition(session, 'investigate');
    askQuestion(session, 'Q_OOS_CONFIRM', domainState(session, fixture));
    expect(() => {
      askQuestion(session, 'Q_OOS_CONFIRM', domainState(session, fixture));
    }).toThrow();
  });
  it('caps questions by distinct IDs and preserves complete signed history turns', () => {
    const session = new SessionStore().create();
    session.toolsCalled = new Set([
      'get_seller_snapshot',
      'get_sku_breakdown',
      'get_cancellation_breakdown',
    ]);
    session.questionsAsked = ['Q_OOS_CONFIRM', 'Q_RESTOCK_ETA', 'Q_VIEWS'];
    expect(() => {
      askQuestion(session, 'Q_CAPACITY', domainState(session, fixture));
    }).toThrow();
    const signed = {
      role: 'model',
      parts: [
        {
          thoughtSignature: 'signed',
          functionCall: { name: 'read', args: {} },
        },
      ],
    };
    session.history = [
      { turn: 1, messages: [{ kind: 'user', text: 'older' }] },
      {
        turn: 2,
        messages: [
          { kind: 'user', text: 'latest' },
          { kind: 'model', content: [signed] },
          {
            kind: 'tools',
            results: [{ name: 'read', response: { ok: true } }],
          },
        ],
      },
    ];
    const draft = cloneSession(session);
    draft.facts.oos_confirmed = {
      factId: 'oos_confirmed',
      value: 'yes',
      quote: 'Both are out of stock',
      turn: 1,
    };
    trimHistory(draft, 3);
    expect(draft.history).toHaveLength(1);
    expect(draft.history[0]?.messages[1]).toEqual({
      kind: 'model',
      content: [signed],
    });
    expect(draft.facts.oos_confirmed.value).toBe('yes');
    expect(session.facts.oos_confirmed).toBeUndefined();
    expect(
      draft.history[0]?.messages[1]?.kind === 'model' &&
        draft.history[0].messages[1].content[0],
    ).toBe(signed);
    expect(session.history).toHaveLength(2);
  });
});
