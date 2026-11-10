import { describe, expect, it } from 'vitest';
import { LiveBudget, option, validateArgs } from '../../scripts/live-budget';
import { PERSONAS } from '../../scripts/eval-personas';
import { assertions } from '../../scripts/eval-assertions';
import { SessionStore } from '@/lib/server/session-store';
import { FakeLlm } from '@/lib/llm/fake';
import { fixture } from '../fixtures';

describe('live harness controls, tested without providers', () => {
  it('rejects misspelled or repeated options before a small pilot can become a full paid run', () => {
    expect(() => {
      validateArgs(['--persona', '--runs'], ['--person', 'S1']);
    }).toThrow();
    expect(() => {
      validateArgs(['--runs'], ['--runs', '1', '--runs', '3']);
    }).toThrow();
    expect(() => {
      validateArgs(['--runs'], ['--runs']);
    }).toThrow();
    expect(() => {
      validateArgs(['--persona'], ['--persona=S1']);
    }).not.toThrow();
    expect(option('--persona', undefined, ['--persona=S1'])).toBe('S1');
  });
  it('has exactly nine supported personas and a transparent twenty-seven-run scope', () => {
    expect(Object.keys(PERSONAS)).toEqual([
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'S7',
      'S9',
      'S10',
    ]);
    expect(Object.keys(PERSONAS).length * 3).toBe(27);
  });
  it('refuses token reservations before invoking a provider', async () => {
    const llm = new FakeLlm([{ text: ['Hello.'] }]);
    const budget = new LiveBudget(10, 1);
    await expect(
      budget
        .provider(llm, 300)
        .stream(
          { system: 'test', tools: [], history: [] },
          () => Promise.resolve(),
          new AbortController().signal,
        ),
    ).rejects.toMatchObject({ code: 'DAILY_LIMIT' });
    expect(llm.requests).toHaveLength(0);
  });
  it('enforces the shared logical request cap for agent and simulator work', async () => {
    const llm = new FakeLlm([{ text: ['Hello.'] }, { text: ['Hello again.'] }]);
    const budget = new LiveBudget(100000, 1);
    const provider = budget.provider(llm, 300);
    await provider.stream(
      { system: 'test', tools: [], history: [] },
      () => Promise.resolve(),
      new AbortController().signal,
    );
    await expect(
      provider.stream(
        { system: 'test', tools: [], history: [] },
        () => Promise.resolve(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'DAILY_LIMIT' });
    expect(llm.requests).toHaveLength(1);
  });
  it('retains persona, speech and question failures instead of granting empty traces a pass', () => {
    const session = new SessionStore().create();
    session.questionsAsked = [
      'Q_OOS_CONFIRM',
      'Q_RESTOCK_ETA',
      'Q_VIEWS',
      'Q_DISPATCH',
    ];
    const failures = assertions(
      'S1',
      session,
      [
        {
          seller: 'Hello',
          before: 'greeting',
          after: 'intake',
          history: [],
          metrics: null,
          events: [
            {
              event: 'sentence',
              data: {
                idx: 0,
                text: 'I updated your Snapdeal inventory and guarantee ninety thousand impressions.',
              },
            },
          ],
        },
      ],
      [],
      fixture,
    );
    expect(failures).toContain('More than three investigation questions');
    expect(failures).toContain('Claims a Snapdeal system change');
    expect(
      failures.some((failure) =>
        failure.startsWith('Unsupported numeric speech'),
      ),
    ).toBe(true);
    expect(failures).toContain('S1 wrong plan');
  });
});
