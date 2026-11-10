import 'server-only';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { committedPlanSchema } from '@/lib/domain/plan';
import type { CommittedPlan } from '@/lib/domain/plan';
import { getConfig } from '@/lib/server/config';
import { throwIfAborted } from '@/lib/voice/abort';

// One long-lived process owns this demo ledger. Serialize appends per file.
const writes = new Map<string, Promise<void>>();

async function readRecords(filename: string): Promise<CommittedPlan[]> {
  let contents: string;
  try {
    contents = await readFile(filename, 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return [];
    throw new AppError('LEDGER_IO', 'Unable to read the plan ledger', true);
  }
  if (!contents) return [];
  if (!contents.endsWith('\n'))
    throw new AppError(
      'LEDGER_INVALID',
      'Ledger has an incomplete final record',
    );
  return contents
    .slice(0, -1)
    .split('\n')
    .map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new AppError(
          'LEDGER_INVALID',
          `Invalid ledger record at line ${String(index + 1)}`,
        );
      }
      const parsed = committedPlanSchema.safeParse(value);
      if (!parsed.success)
        throw new AppError(
          'LEDGER_INVALID',
          `Invalid ledger record at line ${String(index + 1)}`,
        );
      return parsed.data;
    });
}

export async function appendPlan(
  input: unknown,
  dataDir: string = getConfig().dataDir,
  options?: { once?: boolean; signal?: AbortSignal },
): Promise<void> {
  const parsed = committedPlanSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError('LEDGER_INVALID', 'Invalid committed plan record');
  const directory = resolve(dataDir);
  const filename = resolve(directory, 'ledger.jsonl');
  const previous = writes.get(filename) ?? Promise.resolve();
  const write = previous
    .catch(() => undefined)
    .then(async (): Promise<void> => {
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const existing = await readRecords(filename);
        throwIfAborted(options?.signal);
        if (options?.once) {
          const prior = existing.find(
            (record) => record.plan.id === parsed.data.plan.id,
          );
          if (prior) {
            if (
              JSON.stringify(prior.plan) !== JSON.stringify(parsed.data.plan) ||
              [...prior.acceptedActionIds].sort().join(',') !==
                [...parsed.data.acceptedActionIds].sort().join(',')
            )
              throw new AppError(
                'LEDGER_INVALID',
                'A different commitment already uses this plan identifier',
              );
            return;
          }
        }
        await appendFile(filename, `${JSON.stringify(parsed.data)}\n`, {
          encoding: 'utf8',
          flag: 'a',
          mode: 0o600,
        });
      } catch (error: unknown) {
        if (error instanceof AppError) throw error;
        throw new AppError(
          'LEDGER_IO',
          'Unable to append the committed plan',
          true,
        );
      }
    });
  writes.set(filename, write);
  try {
    await write;
  } finally {
    if (writes.get(filename) === write) writes.delete(filename);
  }
}

export async function listLatest(
  limit = 20,
  dataDir: string = getConfig().dataDir,
): Promise<CommittedPlan[]> {
  if (!z.number().int().min(0).max(1000).safeParse(limit).success)
    throw new AppError(
      'LEDGER_INVALID',
      'Ledger limit must be an integer from zero to one thousand',
    );
  const records = await readRecords(resolve(dataDir, 'ledger.jsonl'));
  return limit === 0 ? [] : records.slice(-limit).reverse();
}

export async function getLatestPlan(
  planId: string,
  dataDir: string = getConfig().dataDir,
): Promise<CommittedPlan | null> {
  const records = await readRecords(resolve(dataDir, 'ledger.jsonl'));
  return records.reverse().find((record) => record.plan.id === planId) ?? null;
}
