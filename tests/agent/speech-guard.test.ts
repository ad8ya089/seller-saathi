import { describe, expect, it } from 'vitest';
import { SpeechGuard } from '@/lib/agent/speech-guard';
import { SessionStore } from '@/lib/server/session-store';
import { fixture } from '../fixtures';
import { spokenEvidence } from '@/lib/agent/snapshot';

describe('speech grounding before TTS', () => {
  it('rejects invented numbers, unsupported save claims and multiple questions before speaking', () => {
    const session = new SessionStore().create();
    session.toolsCalled.add('get_seller_snapshot');
    session.toolsCalled.add('get_sku_breakdown');
    session.toolsCalled.add('get_cancellation_breakdown');
    const gate = new SpeechGuard(
      session,
      fixture,
      'findings',
      'Are those your regular best sellers?',
    );
    expect(gate.accept('Your sales fell by twenty percent.')).toBeNull();
    expect(gate.accept('I updated Snapdeal for you.')).toBeNull();
    expect(gate.accept('Saved to Snapdeal.')).toBeNull();
    expect(gate.accept('Why? What happened?')).toBeNull();
    const approved = spokenEvidence(session, fixture).at(-1) ?? '';
    expect(gate.accept(approved)).toBe(approved);
  });
});
