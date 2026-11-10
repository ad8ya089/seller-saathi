import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendPlan, getLatestPlan, listLatest } from '@/lib/server/ledger';
import { buildPlan } from '@/lib/domain/actions';
import type { CommittedPlan } from '@/lib/domain/plan';
import { fixture } from '../fixtures';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'seller-saathi-ledger-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function record(id: string): CommittedPlan {
  const plan = buildPlan(
    {
      snapshot: fixture.seller,
      skus: fixture.skus,
      cancellations: fixture.cancellations,
      facts: {},
      questionsAsked: [],
      toolsCalled: new Set([
        'get_seller_snapshot',
        'get_sku_breakdown',
        'get_cancellation_breakdown',
      ]),
    },
    new Date('2026-11-10T00:00:00Z'),
    id,
  );
  return {
    schemaVersion: 1,
    event: 'plan_committed',
    plan,
    committedAt: '2026-11-10T12:00:00Z',
    acceptedActionIds: plan.actions.map((action) => action.id),
  };
}

describe('append-only committed-plan ledger', () => {
  it('creates the directory, appends JSONL and preserves the existing prefix', async () => {
    const nested = join(directory, 'nested');
    await appendPlan(record('first'), nested);
    const first = await readFile(join(nested, 'ledger.jsonl'), 'utf8');
    await appendPlan(record('second'), nested);
    const both = await readFile(join(nested, 'ledger.jsonl'), 'utf8');
    expect(both.startsWith(first)).toBe(true);
    expect(both.trim().split('\n')).toHaveLength(2);
    expect((await listLatest(1, nested)).map((entry) => entry.plan.id)).toEqual(
      ['second'],
    );
    expect(await getLatestPlan('first', nested)).toEqual(record('first'));
    expect(await listLatest(0, nested)).toEqual([]);
  });
  it('returns an empty history for a new ledger', async () => {
    expect(await listLatest(20, directory)).toEqual([]);
    expect(await getLatestPlan('missing', directory)).toBeNull();
  });
  it('serializes concurrent writes without losing records', async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        appendPlan(record(`plan-${String(index)}`), directory),
      ),
    );
    const records = await listLatest(20, directory);
    expect(records).toHaveLength(12);
    expect(new Set(records.map((entry) => entry.plan.id)).size).toBe(12);
  });
  it('retrieves the most recently appended version of a plan', async () => {
    const original = record('same');
    await appendPlan(original, directory);
    const updated = { ...original, committedAt: '2026-11-10T13:00:00Z' };
    await appendPlan(updated, directory);
    expect(await getLatestPlan('same', directory)).toEqual(updated);
  });
  it('rejects invalid records before creating or modifying the ledger', async () => {
    await expect(
      appendPlan({ invalid: true }, directory),
    ).rejects.toMatchObject({ code: 'LEDGER_INVALID' });
    expect(await listLatest(20, directory)).toEqual([]);
    const invalid = { ...record('bad'), acceptedActionIds: ['A_FOLLOWUP'] };
    await expect(appendPlan(invalid, directory)).rejects.toMatchObject({
      code: 'LEDGER_INVALID',
    });
  });
  it.each(['not JSON\n', '{}\n'])(
    'rejects a corrupt existing line without including raw data',
    async (contents) => {
      await writeFile(join(directory, 'ledger.jsonl'), contents);
      await expect(listLatest(20, directory)).rejects.toMatchObject({
        code: 'LEDGER_INVALID',
        message: 'Invalid ledger record at line 1',
      });
    },
  );
  it('refuses to append to a truncated ledger and preserves its bytes', async () => {
    const contents = JSON.stringify(record('truncated'));
    await writeFile(join(directory, 'ledger.jsonl'), contents);
    await expect(appendPlan(record('new'), directory)).rejects.toMatchObject({
      code: 'LEDGER_INVALID',
    });
    expect(await readFile(join(directory, 'ledger.jsonl'), 'utf8')).toBe(
      contents,
    );
  });
  it('returns typed I/O errors and permits later writes after a failed append', async () => {
    const file = join(directory, 'file');
    await writeFile(file, 'not a directory');
    await expect(appendPlan(record('blocked'), file)).rejects.toMatchObject({
      code: 'LEDGER_IO',
      retryable: true,
    });
    await appendPlan(record('working'), directory);
    expect(await listLatest(1, directory)).toHaveLength(1);
  });
  it('rejects invalid history limits', async () => {
    await expect(listLatest(-1, directory)).rejects.toMatchObject({
      code: 'LEDGER_INVALID',
    });
    await expect(listLatest(1.5, directory)).rejects.toMatchObject({
      code: 'LEDGER_INVALID',
    });
  });
});
