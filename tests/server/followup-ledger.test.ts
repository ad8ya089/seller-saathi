import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { appendAudit, findAudit } from '@/lib/server/followup-ledger';
import { appendPlan } from '@/lib/server/ledger';
import { dashboardFixture } from '../dashboard-fixtures';
import { fixture } from '../fixtures';
import { auditActions } from '@/lib/domain/followup-audit';
import type { FollowupAudit } from '@/lib/domain/followup-types';

it('appends an idempotent audit separately, rejects conflicts and preserves original ledger bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seller-saathi-audit-'));
  const original = dashboardFixture().committed;
  try {
    await appendPlan(original, directory);
    const before = await readFile(join(directory, 'ledger.jsonl'), 'utf8');
    const audit: FollowupAudit = {
      schemaVersion: 1,
      event: 'followup_audited',
      planId: original.plan.id,
      runId: '11111111-1111-4111-8111-111111111111',
      simulatedDate: '2026-11-17',
      recordedAt: '2026-11-11T12:00:00Z',
      rows: auditActions(original, fixture.followup),
      sellerQuote: 'Yes, that matches.',
      facts: {},
      phaseTrace: ['FOLLOWUP_INTRO', 'AUDIT', 'RE_DIAGNOSE', 'NEXT_STEPS'],
    };
    await Promise.all([
      appendAudit(audit, directory),
      appendAudit(audit, directory),
    ]);
    expect(await findAudit(original.plan.id, audit.runId, directory)).toEqual(
      audit,
    );
    expect(
      (await readFile(join(directory, 'followup-audits.jsonl'), 'utf8'))
        .trim()
        .split('\n'),
    ).toHaveLength(1);
    await expect(
      appendAudit({ ...audit, sellerQuote: 'Different' }, directory),
    ).rejects.toMatchObject({ code: 'LEDGER_INVALID' });
    await expect(
      findAudit('another-plan', audit.runId, directory),
    ).rejects.toMatchObject({ code: 'COMMIT_REJECTED' });
    expect(await readFile(join(directory, 'ledger.jsonl'), 'utf8')).toBe(
      before,
    );
  } finally {
    await unlink(join(directory, 'ledger.jsonl'));
    await unlink(join(directory, 'followup-audits.jsonl')).catch(
      () => undefined,
    );
    await rmdir(directory);
  }
});
