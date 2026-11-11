import { expect, it } from 'vitest';
import { runFollowupEvaluation } from '../../scripts/eval-followup';
import { fixture } from '../fixtures';

it('runs F1 completely offline and reports tools, phases, statuses, language and ledger changes separately', async () => {
  const result = await runFollowupEvaluation(fixture, {
    now: new Date('2026-11-11T12:00:00Z'),
  });
  expect(result.failures).toEqual([]);
  expect(result.provider).toBe('fake');
  expect(result.promptVersion).toBe('4.0.0');
  expect(result.language).toBe('en-IN');
  expect(result.tools).toEqual(['get_followup_status', 'commit_action_plan']);
  expect(result.phaseTrace).toEqual([
    'FOLLOWUP_INTRO',
    'AUDIT',
    'RE_DIAGNOSE',
    'NEXT_STEPS',
    'DONE',
  ]);
  expect(result.statuses.map((row) => row.status)).toEqual([
    'partial',
    'done',
    'done',
  ]);
  expect(result.ledgerChanges).toEqual({
    plans: 1,
    audits: 1,
    originalUnchanged: true,
  });
});
