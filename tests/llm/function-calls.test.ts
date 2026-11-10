import { describe, expect, it } from 'vitest';
import { FunctionCalls } from '@/lib/llm/function-calls';

describe('streamed function arguments', () => {
  it('assembles partial string values and array elements without changing signed parts', () => {
    const calls = new FunctionCalls();
    calls.add({
      name: 'record_seller_fact',
      id: 'a',
      willContinue: true,
      args: { factId: 'restock_cause' },
      partialArgs: [
        { jsonPath: '$.quote', stringValue: 'Supplier ', willContinue: true },
      ],
    });
    calls.add({
      id: 'a',
      partialArgs: [{ jsonPath: '$.quote', stringValue: 'is late.' }],
    });
    calls.add({
      name: 'propose_action_plan',
      partialArgs: [
        { jsonPath: '$.actionIds[0]', stringValue: 'A_STOCK_SYNC' },
      ],
    });
    expect(calls.finish()).toEqual([
      {
        id: 'a',
        name: 'record_seller_fact',
        args: { factId: 'restock_cause', quote: 'Supplier is late.' },
      },
      { name: 'propose_action_plan', args: { actionIds: ['A_STOCK_SYNC'] } },
    ]);
  });
  it.each(['$.__proto__', '$.constructor', '$.value[10000]', '$.value.nested'])(
    'rejects unsafe or unsupported argument paths %s',
    (jsonPath) => {
      expect(() => {
        new FunctionCalls().add({
          name: 'unsafe',
          partialArgs: [{ jsonPath, stringValue: 'bad' }],
        });
      }).toThrow('unsafe function arguments');
    },
  );
  it('does not execute incomplete function calls', () => {
    const calls = new FunctionCalls();
    calls.add({ name: 'save', willContinue: true });
    expect(() => calls.finish()).toThrow('incomplete');
  });
});
