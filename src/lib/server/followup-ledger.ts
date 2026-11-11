import 'server-only';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppError } from '@/lib/errors';
import { followupAuditSchema } from '@/lib/domain/followup-types';
import type { FollowupAudit } from '@/lib/domain/followup-types';
import { throwIfAborted } from '@/lib/voice/abort';

const writes = new Map<string, Promise<void>>();
async function records(directory: string): Promise<FollowupAudit[]> {
  try {
    const contents = await readFile(
      resolve(directory, 'followup-audits.jsonl'),
      'utf8',
    );
    if (!contents) return [];
    if (!contents.endsWith('\n')) throw new Error('Incomplete record');
    return contents
      .slice(0, -1)
      .split('\n')
      .map((line) => followupAuditSchema.parse(JSON.parse(line) as unknown));
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return [];
    throw new AppError(
      'LEDGER_INVALID',
      'Unable to read validated follow-up audits',
    );
  }
}
export async function findAudit(
  planId: string,
  runId: string,
  directory: string,
): Promise<FollowupAudit | null> {
  const prior = (await records(directory)).find(
    (record) => record.runId === runId,
  );
  if (prior && prior.planId !== planId)
    throw new AppError(
      'COMMIT_REJECTED',
      'This follow-up run belongs to another plan',
    );
  return prior ?? null;
}
export async function appendAudit(
  input: unknown,
  directory: string,
  signal?: AbortSignal,
): Promise<void> {
  const parsed = followupAuditSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError('LEDGER_INVALID', 'Invalid follow-up audit');
  const key = resolve(directory, 'followup-audits.jsonl');
  const previous = writes.get(key) ?? Promise.resolve();
  const write = previous
    .catch(() => undefined)
    .then(async (): Promise<void> => {
      const prior = await findAudit(
        parsed.data.planId,
        parsed.data.runId,
        directory,
      );
      throwIfAborted(signal);
      if (prior) {
        if (JSON.stringify(prior) !== JSON.stringify(parsed.data))
          throw new AppError(
            'LEDGER_INVALID',
            'A different audit already uses this run',
          );
        return;
      }
      try {
        await mkdir(resolve(directory), { recursive: true, mode: 0o700 });
        await appendFile(key, `${JSON.stringify(parsed.data)}\n`, {
          flag: 'a',
          encoding: 'utf8',
          mode: 0o600,
        });
      } catch {
        throw new AppError(
          'LEDGER_IO',
          'Unable to append follow-up audit',
          true,
        );
      }
    });
  writes.set(key, write);
  try {
    await write;
  } finally {
    if (writes.get(key) === write) writes.delete(key);
  }
}
