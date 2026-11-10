import { describe, expect, it } from 'vitest';
import { applyPlaybackReceipt } from '@/lib/agent/interruption';
import { SessionStore } from '@/lib/server/session-store';

describe('interrupted history', () => {
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
