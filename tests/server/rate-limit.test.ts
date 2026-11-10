import { describe, expect, it } from 'vitest';
import { TokenBucket, DailyBudget } from '@/lib/server/rate-limit';

describe('synchronous process-local admission', () => {
  it('admits exactly forty concurrent requests and refills gradually', async () => {
    let now = 0;
    const bucket = new TokenBucket(40, 600000, () => now);
    const results = await Promise.all(
      Array.from({ length: 45 }, () =>
        Promise.resolve().then(() => bucket.take('peer')),
      ),
    );
    expect(results.filter((result) => result === 0)).toHaveLength(40);
    expect(bucket.take('peer')).toBe(15);
    now = 15000;
    expect(bucket.take('peer')).toBe(0);
  });
  it('resets the daily cap at midnight Asia/Kolkata and never overshoots', () => {
    let date = new Date('2026-11-10T18:29:59Z');
    const budget = new DailyBudget(2, () => date);
    budget.accept();
    budget.accept();
    expect(() => {
      budget.accept();
    }).toThrow('daily');
    date = new Date('2026-11-10T18:30:00Z');
    budget.accept();
    expect(budget.snapshot()).toEqual({
      day: '2026-11-11',
      accepted: 1,
      cap: 2,
      timezone: 'Asia/Kolkata',
    });
  });
});
