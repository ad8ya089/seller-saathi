import { describe, expect, it } from 'vitest';
import { compactToolHistory } from '@/lib/agent/history';
import { SessionStore } from '@/lib/server/session-store';

describe('completed tool-result compaction', () => {
  it('reduces repeated payload while preserving signed Content objects, call IDs and factual values', () => {
    const session = new SessionStore().create();
    const content = {
      role: 'model',
      parts: [
        {
          functionCall: {
            name: 'get_seller_snapshot',
            id: 'signed-call',
            args: {},
          },
          thoughtSignature: 'opaque-signature',
          unknownMetadata: { preserve: true },
        },
      ],
    };
    const original = {
      ok: true,
      bridge: { salesDelta: -65000 },
      hypotheses: [
        { id: 'STOCK', score: 9, level: 'high', evidence: ['read'] },
      ],
      eligibleActions: [{ long: 'x'.repeat(3000) }],
    };
    session.history.push({
      turn: 1,
      spoken: 'Findings were delivered.',
      messages: [
        { kind: 'model', content: [content] },
        {
          kind: 'tools',
          results: [
            {
              name: 'get_seller_snapshot',
              id: 'signed-call',
              response: original,
            },
          ],
        },
      ],
    });
    const size = compactToolHistory(session);
    expect(size.after).toBeLessThan(size.before / 2);
    const model = session.history[0]?.messages[0];
    expect(model?.kind === 'model' ? model.content[0] : null).toBe(content);
    const tools = session.history[0]?.messages[1];
    expect(tools?.kind === 'tools' ? tools.results[0] : null).toMatchObject({
      name: 'get_seller_snapshot',
      id: 'signed-call',
      response: {
        ok: true,
        bridge: { salesDelta: -65000 },
        hypotheses: [{ id: 'STOCK', score: 9, level: 'high' }],
      },
    });
    expect(original.eligibleActions[0]?.long).toHaveLength(3000);
    expect(compactToolHistory(session).after).toBe(size.after);
  });
  it('keeps unresolved/interrupted exchanges, errors and proposal/commit results intact', () => {
    const session = new SessionStore().create();
    const response = {
      ok: true,
      planId: 'plan',
      plan: { value: 'x'.repeat(3000) },
    };
    const error = { ok: false, error: 'Correct the arguments.' };
    session.history.push({
      turn: 1,
      spoken: 'Plan.',
      messages: [
        {
          kind: 'tools',
          results: [
            { name: 'propose_action_plan', response },
            { name: 'get_seller_snapshot', response: error },
          ],
        },
      ],
    });
    session.history.push({
      turn: 2,
      interrupted: true,
      spoken: 'Interrupted.',
      messages: [
        { kind: 'tools', results: [{ name: 'get_seller_snapshot', response }] },
      ],
    });
    expect(compactToolHistory(session).after).toBe(
      compactToolHistory(session).before,
    );
  });
});
