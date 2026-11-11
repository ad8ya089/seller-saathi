import { CLIP_TEXT } from '@/lib/voice/clips';
import 'server-only';
import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { Session } from '@/lib/agent/session';
import { languageSchema } from '@/lib/voice/language';
import type { Language } from '@/lib/voice/language';

interface Limits {
  ttlMs: number;
  maxTurns: number;
  maxMs: number;
}
export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly activity = new Map<string, number>();
  private readonly busy = new Set<string>();
  private readonly cancellations = new Map<string, AbortController>();
  constructor(
    private readonly limits: Limits = {
      ttlMs: 1800000,
      maxTurns: 25,
      maxMs: 600000,
    },
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}
  create(options: { lang?: Language } = {}): Session {
    this.prune();
    const session: Session = {
      id: this.createId(),
      createdAt: this.now(),
      lang: languageSchema.parse(options.lang ?? 'en-IN'),
      mode: 'call',
      phase: 'greeting',
      turn: 0,
      questionsAsked: [],
      facts: {},
      toolsCalled: new Set(),
      hypotheses: [],
      history: [],
      lastUserText: '',
      counters: {
        sttCalls: 0,
        ttsChars: 0,
        llmCalls: 0,
        tokens: { input: 0, output: 0, thoughts: 0 },
      },
    };
    this.sessions.set(session.id, session);
    this.activity.set(session.id, this.now());
    this.cancellations.set(session.id, new AbortController());
    return session;
  }
  get(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Start a new call.');
    if (
      this.now() - (this.activity.get(session.id) ?? session.createdAt) >=
      this.limits.ttlMs
    ) {
      this.remove(id);
      throw new AppError(
        'SESSION_EXPIRED',
        'This call has expired. Start a new call.',
      );
    }
    return session;
  }
  assertCanTurn(session: Session): void {
    if (this.now() - session.createdAt >= this.limits.maxMs)
      throw new AppError('SESSION_LIMIT', CLIP_TEXT.time);
    if (session.turn >= this.limits.maxTurns)
      throw new AppError('SESSION_LIMIT', CLIP_TEXT.turns);
    if (session.phase === 'done')
      throw new AppError(
        'SESSION_LIMIT',
        'This call is complete. Start a new call.',
      );
  }
  async exclusive<T>(
    id: string,
    run: (session: Session) => Promise<T>,
  ): Promise<T> {
    const session = this.get(id);
    if (this.busy.has(id))
      throw new AppError(
        'SESSION_BUSY',
        'Another turn is still running. Please wait.',
        true,
      );
    this.busy.add(id);
    this.activity.set(id, this.now());
    try {
      return await run(session);
    } finally {
      this.busy.delete(id);
      if (this.sessions.has(id)) this.activity.set(id, this.now());
    }
  }
  remove(id: string): void {
    this.cancellations.get(id)?.abort();
    this.cancellations.delete(id);
    this.sessions.delete(id);
    this.activity.delete(id);
  }
  signal(id: string): AbortSignal {
    this.get(id);
    const controller = this.cancellations.get(id);
    if (!controller)
      throw new AppError('SESSION_NOT_FOUND', 'Start a new call.');
    const remaining =
      Math.min(this.limits.ttlMs, this.limits.maxMs) -
      (this.now() - this.get(id).createdAt);
    return AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(Math.max(1, Math.min(2147483647, remaining))),
    ]);
  }
  count(): number {
    this.prune();
    return this.sessions.size;
  }
  private prune(): void {
    for (const [id, session] of this.sessions)
      if (
        !this.busy.has(id) &&
        this.now() - (this.activity.get(session.id) ?? session.createdAt) >=
          this.limits.ttlMs
      )
        this.remove(id);
  }
}
