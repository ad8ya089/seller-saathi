import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadData, readDataFile } from '@/lib/server/data-loader';
import { sellerSnapshotSchema, skuDataSchema } from '@/lib/domain/data-schemas';

const temporaryDirectories: string[] = [];
async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'seller-saathi-data-'));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('validated data loading', () => {
  it('loads all four exact datasets with synthetic labels', async () => {
    const data = await loadData('data');
    expect(data.seller.periods.last.orders).toBe(400);
    expect(data.skus.skus).toHaveLength(8);
    expect(data.cancellations.reasons).toHaveLength(4);
    expect(data.followup.rolling7.orders).toBe(83);
    expect([
      data.skus.synthetic,
      data.cancellations.synthetic,
      data.followup.synthetic,
    ]).toEqual([true, true, true]);
  });

  it('reports a missing file with a typed, useful error', async () => {
    const directory = await temporaryDirectory();
    await expect(
      readDataFile(directory, 'seller.json', sellerSnapshotSchema),
    ).rejects.toMatchObject({
      code: 'DATA_NOT_FOUND',
      message: 'Missing data file: seller.json',
      retryable: false,
    });
  });

  it('rejects malformed JSON without exposing its contents', async () => {
    const directory = await temporaryDirectory();
    await writeFile(
      join(directory, 'seller.json'),
      '{private-malformed-content',
    );
    await expect(
      readDataFile(directory, 'seller.json', sellerSnapshotSchema),
    ).rejects.toMatchObject({
      code: 'DATA_INVALID',
      message: 'Malformed JSON in seller.json',
    });
  });

  it('reports schema field paths without echoing raw values', async () => {
    const directory = await temporaryDirectory();
    await writeFile(
      join(directory, 'seller.json'),
      JSON.stringify({ sellerId: 'secret-test-value' }),
    );
    await expect(
      readDataFile(directory, 'seller.json', sellerSnapshotSchema),
    ).rejects.toThrow(/periods/);
    await expect(
      readDataFile(directory, 'seller.json', sellerSnapshotSchema),
    ).rejects.not.toThrow(/secret-test-value/);
  });

  it('rejects negative stock and duplicate SKU identifiers', async () => {
    const data = await loadData('data');
    const first = data.skus.skus[0];
    expect(first).toBeDefined();
    if (!first) throw new Error('Fixture is missing its first SKU');
    expect(
      skuDataSchema.safeParse({ ...data.skus, skus: [{ ...first, stock: -1 }] })
        .success,
    ).toBe(false);
    expect(
      skuDataSchema.safeParse({ ...data.skus, skus: [first, first] }).success,
    ).toBe(false);
  });
});
