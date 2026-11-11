import { expect, it } from 'vitest';
import { supportedFacts } from '@/lib/agent/turn-policy';

it('does not infer intermittent dispatch from a statement about partial restock', () => {
  const hindi = supportedFacts(
    'Main partial restock nahi kar sakta.',
    undefined,
    1,
    'hi-IN',
  );
  expect(hindi).toEqual([
    {
      factId: 'can_restock_partial',
      value: 'no',
      quote: 'Main partial restock nahi kar sakta.',
      turn: 1,
    },
  ]);
  const english = supportedFacts('I can do a partial restock.', undefined, 1);
  expect(english.some((fact) => fact.factId === 'dispatch_on_time')).toBe(
    false,
  );
  expect(
    supportedFacts('Dispatch is sometimes late.', undefined, 1).some(
      (fact) => fact.factId === 'dispatch_on_time',
    ),
  ).toBe(true);
});
