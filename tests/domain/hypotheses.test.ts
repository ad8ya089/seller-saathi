import { describe, expect, it } from 'vitest';
import { confidence, margin, scoreHypotheses } from '@/lib/domain/hypotheses';
import { signals } from '@/lib/domain/signals';
import { sellerFactSchema } from '@/lib/domain/types';
import type { Evidence, SellerFact } from '@/lib/domain/types';
import { fixture } from '../fixtures';

const snapshotEvidence = signals({ seller: fixture.seller })
  .filter((signal) => signal.triggered)
  .map((signal) => signal.evidence);
const detailEvidence = signals(fixture)
  .filter((signal) => signal.triggered)
  .map((signal) => signal.evidence);
const stockScore = (evidence: Evidence[]): number | undefined =>
  scoreHypotheses(evidence).find((hypothesis) => hypothesis.id === 'STOCK')
    ?.score;

describe('evidence scoring', () => {
  it('matches snapshot weights and ranks ties deterministically', () => {
    expect(
      scoreHypotheses(snapshotEvidence).map(({ id, score }) => [id, score]),
    ).toEqual([
      ['STOCK', 4],
      ['FULFIL', 1],
      ['VIS', 1],
      ['DEMAND', 1],
      ['PRICE', -1],
    ]);
  });
  it('preserves data evidence when stock is confirmed or denied', () => {
    expect(stockScore(detailEvidence)).toBe(9);
    for (const [value, expected] of [
      ['yes', 11],
      ['no', 7],
    ] as const) {
      expect(
        stockScore([
          ...detailEvidence,
          {
            source: 'seller',
            fact: { factId: 'oos_confirmed', value, quote: value, turn: 1 },
          },
        ]),
      ).toBe(expected);
    }
  });
  it.each([
    ['dispatch_on_time', 'no', 'FULFIL', 3],
    ['dispatch_on_time', 'sometimes', 'FULFIL', 1],
    ['dispatch_on_time', 'yes', 'FULFIL', -1.5],
    ['views_dropped', 'yes', 'VIS', 3],
    ['views_dropped', 'no', 'VIS', -1.5],
    ['competitor_undercut', 'yes', 'PRICE', 3],
    ['competitor_undercut', 'no', 'PRICE', -1],
  ] as const)(
    'applies %s=%s exactly',
    (factId, value, hypothesis, expected) => {
      const evidence: Evidence[] = [
        {
          source: 'seller',
          fact: sellerFactSchema.parse({
            factId,
            value,
            quote: value,
            turn: 1,
          }),
        },
      ];
      expect(
        scoreHypotheses(evidence).find((score) => score.id === hypothesis)
          ?.score,
      ).toBe(expected);
    },
  );
  it('unknown and operational facts add no invented diagnostic weight', () => {
    const fact: SellerFact = {
      factId: 'views_dropped',
      value: 'unknown',
      quote: 'I do not know',
      turn: 1,
    };
    expect(
      scoreHypotheses([{ source: 'seller', fact }]).every(
        (hypothesis) => hypothesis.score === 0,
      ),
    ).toBe(true);
  });
  it('does not double count repeated evidence and keeps the latest seller fact', () => {
    expect(stockScore([...detailEvidence, ...detailEvidence])).toBe(9);
    const facts: Evidence[] = [
      {
        source: 'seller',
        fact: { factId: 'oos_confirmed', value: 'yes', quote: 'yes', turn: 1 },
      },
      {
        source: 'seller',
        fact: { factId: 'oos_confirmed', value: 'no', quote: 'no', turn: 2 },
      },
    ];
    expect(stockScore([...detailEvidence, ...facts])).toBe(7);
  });
  it('classifies confidence boundaries and computes margins', () => {
    expect([
      confidence(-2),
      confidence(1.9),
      confidence(2),
      confidence(3.9),
      confidence(4),
    ]).toEqual(['low', 'low', 'medium', 'medium', 'high']);
    expect(margin(scoreHypotheses([]))).toBe(0);
    expect(margin(scoreHypotheses(detailEvidence))).toBe(8);
    expect(margin([])).toBe(0);
  });
});
