import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ASSUMPTIONS } from '@/lib/content/assumptions';

describe('documented assumptions', () => {
  it('keeps the one shared A1–A10 constant aligned with the source document', async () => {
    const source = await readFile('docs/01-problem-analysis.md', 'utf8');
    const normalize = (text: string): string =>
      text.replaceAll('**', '').replaceAll('’', "'").trim();
    const rows = [...source.matchAll(/^\|\s*(A\d+)\s*\|\s*(.*?)\s*\|$/gm)].map(
      (match) => ({ id: match[1], text: normalize(match[2] ?? '') }),
    );
    expect(rows).toHaveLength(10);
    expect(
      ASSUMPTIONS.map((item) => ({ id: item.id, text: normalize(item.text) })),
    ).toEqual(rows);
  });
});
