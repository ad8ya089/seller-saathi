import 'server-only';
import { AppError } from '@/lib/errors';

export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  constructor(
    private readonly capacity = 40,
    private readonly windowMs = 600000,
    private readonly now: () => number = performance.now.bind(performance),
  ) {}
  take(key: string): number {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens +
        (Math.max(0, now - bucket.at) * this.capacity) / this.windowMs,
    );
    bucket.at = now;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 10000)
      for (const [peer, value] of this.buckets)
        if (now - value.at >= this.windowMs) this.buckets.delete(peer);
    if (bucket.tokens < 1)
      return Math.ceil(
        ((1 - bucket.tokens) * this.windowMs) / this.capacity / 1000,
      );
    bucket.tokens -= 1;
    return 0;
  }
}

export function indiaDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export class DailyBudget {
  private day = '';
  private accepted = 0;
  constructor(
    private readonly cap = 800,
    private readonly now: () => Date = () => new Date(),
  ) {}
  snapshot(): { day: string; accepted: number; cap: number; timezone: string } {
    const day = indiaDay(this.now());
    if (day !== this.day) {
      this.day = day;
      this.accepted = 0;
    }
    return {
      day: this.day,
      accepted: this.accepted,
      cap: this.cap,
      timezone: 'Asia/Kolkata',
    };
  }
  accept(): void {
    this.snapshot();
    if (this.accepted >= this.cap)
      throw new AppError(
        'DAILY_LIMIT',
        'The daily demo turn budget is exhausted',
      );
    this.accepted += 1;
  }
}
