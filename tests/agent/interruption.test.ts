import { describe, expect, it } from 'vitest';
import { applyPlaybackReceipt } from '@/lib/agent/interruption';
import { SessionStore } from '@/lib/server/session-store';
import { buildPlan } from '@/lib/domain/actions';
import { domainState } from '@/lib/agent/session';
import { fixture } from '../fixtures';
import { QUESTION_BANK } from '@/lib/domain/questions';

describe('interrupted history', () => {
  it('accepts interruption before transcription and never truncates an older reply after a failed turn', () => {
    const session = new SessionStore().create();
    session.playback = {
      turn: 1,
      sentences: [],
      spoken: '',
      interrupted: true,
    };
    expect(() => {
      applyPlaybackReceipt(session, 0);
    }).not.toThrow();
    session.history.push({
      turn: 1,
      messages: [],
      sentences: ['Heard earlier.'],
      spoken: 'Heard earlier.',
    });
    session.playback = {
      turn: 2,
      sentences: [],
      spoken: '',
      interrupted: true,
    };
    applyPlaybackReceipt(session, 0);
    expect(session.history[0]?.spoken).toBe('Heard earlier.');
  });
  it('invalidates an incompletely heard plan and releases only an unheard investigation question', () => {
    const session = new SessionStore().create();
    session.toolsCalled = new Set([
      'get_seller_snapshot',
      'get_sku_breakdown',
      'get_cancellation_breakdown',
    ]);
    session.phase = 'confirm';
    session.turn = 2;
    session.proposedPlan = {
      plan: buildPlan(
        domainState(session, fixture),
        new Date('2026-11-11T00:00:00Z'),
      ),
      proposedAtTurn: 2,
    };
    session.history.push({
      turn: 2,
      messages: [],
      sentences: ['First action.', 'Second action.', 'Shall I save this plan?'],
    });
    applyPlaybackReceipt(session, 1);
    expect(session.proposedPlan).toBeUndefined();
    expect(session.phase).toBe('investigate');
    session.phase = 'investigate';
    session.questionsAsked = ['Q_OOS_CONFIRM'];
    session.history.push({
      turn: 3,
      messages: [],
      questionId: 'Q_OOS_CONFIRM',
      sentences: ['Evidence.', QUESTION_BANK.Q_OOS_CONFIRM.text],
    });
    applyPlaybackReceipt(session, 1);
    expect(session.questionsAsked).toEqual([]);
  });
  it('keeps signed exchanges intact and limits the heard reply to completed sentences', () => {
    const session = new SessionStore().create();
    const signed = {
      role: 'model',
      parts: [{ text: 'First. Second.', thoughtSignature: 'signed' }],
    };
    session.history.push({
      turn: 1,
      messages: [{ kind: 'model', content: [signed] }],
      sentences: ['First.', 'Second.'],
      spoken: 'First. Second.',
    });
    applyPlaybackReceipt(session, 1);
    expect(session.history[0]?.spoken).toBe(
      'First. [Interrupted by seller; remaining speech was not heard.]',
    );
    expect(session.history[0]?.messages[0]).toEqual({
      kind: 'model',
      content: [signed],
    });
    expect(() => {
      applyPlaybackReceipt(session, 3);
    }).toThrow('playedSentences');
  });
  it('accepts interruption during the first sentence and rejects receipts without a reply', () => {
    const session = new SessionStore().create();
    expect(() => {
      applyPlaybackReceipt(session, 0);
    }).toThrow('playedSentences');
    session.history.push({ turn: 1, messages: [], sentences: ['First.'] });
    applyPlaybackReceipt(session, 0);
    expect(session.history[0]?.spoken).toBe(
      '[Interrupted by seller; remaining speech was not heard.]',
    );
  });
});
