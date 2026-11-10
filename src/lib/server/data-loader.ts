import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import { AppError } from '@/lib/errors';
import {
  sellerSnapshotSchema,
  skuDataSchema,
  cancellationDataSchema,
  followupDataSchema,
} from '@/lib/domain/data-schemas';
import type { SellerData } from '@/lib/domain/data-schemas';
import { getConfig } from '@/lib/server/config';

type DataFile =
  'seller.json' | 'skus.json' | 'cancellations.json' | 'followup_day7.json';

export async function readDataFile<T>(
  directory: string,
  filename: DataFile,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(join(directory, filename), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new AppError('DATA_NOT_FOUND', `Missing data file: ${filename}`);
    }
    throw new AppError(
      'DATA_IO',
      `Unable to read data file: ${filename}`,
      true,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AppError('DATA_INVALID', `Malformed JSON in ${filename}`);
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join('.') || '(root)')
      .join(', ');
    throw new AppError('DATA_INVALID', `Invalid ${filename}: ${fields}`);
  }
  return result.data;
}

export async function loadData(
  directory: string = getConfig().mockDataDir,
): Promise<SellerData> {
  const [seller, skus, cancellations, followup] = await Promise.all([
    readDataFile(directory, 'seller.json', sellerSnapshotSchema),
    readDataFile(directory, 'skus.json', skuDataSchema),
    readDataFile(directory, 'cancellations.json', cancellationDataSchema),
    readDataFile(directory, 'followup_day7.json', followupDataSchema),
  ]);
  return { seller, skus, cancellations, followup };
}
