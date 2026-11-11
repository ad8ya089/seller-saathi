import 'server-only';
import { open, stat } from 'node:fs/promises';
import { AppError } from '@/lib/errors';

// Each of the two append-only demo files is bounded independently. Never
// rotate/delete accepted records: refuse new saves so ownership stays intact.
export const LEDGER_MAX_BYTES = 8 * 1024 * 1024;

export async function assertLedgerSpace(
  filename: string,
  extra: number,
): Promise<void> {
  let bytes = 0;
  try {
    bytes = (await stat(filename)).size;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  if (bytes + extra > LEDGER_MAX_BYTES)
    throw new AppError('LEDGER_IO', 'Temporary demo ledger is full', true);
}

export async function readBoundedLedger(filename: string): Promise<string> {
  const file = await open(filename, 'r');
  try {
    if ((await file.stat()).size > LEDGER_MAX_BYTES)
      throw new AppError('LEDGER_IO', 'Temporary demo ledger is full', true);
    // A bounded read even if another local process grows the file meanwhile.
    const buffer = Buffer.alloc(LEDGER_MAX_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        total,
        buffer.length - total,
        null,
      );
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > LEDGER_MAX_BYTES)
      throw new AppError('LEDGER_IO', 'Temporary demo ledger is full', true);
    return buffer.toString('utf8', 0, total);
  } finally {
    await file.close();
  }
}
