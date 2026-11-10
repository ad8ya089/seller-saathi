import 'server-only';
import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { Session } from '@/lib/agent/session';

interface Limits {
  ttlMs: number;
  maxTurns: number;
  maxMs: number;
}
export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly busy = new Set<string>();
  constructor(
    private readonly limits: Limits = {
      ttlMs: 1800000,
      maxTurns: 25,
      maxMs: 600000,
    },
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}
  create(): Session {
    this.prune();
    const session: Session = {
      id: this.createId(),
      createdAt: this.now(),
      lang: 'en-IN',
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
    return session;
  }
  get(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Start a new call.');
    if (this.now() - session.createdAt >= this.limits.ttlMs) {
      this.sessions.delete(id);
      throw new AppError(
        'SESSION_EXPIRED',
        'This call has expired. Start a new call.',
      );
    }
    return session;
  }
  assertCanTurn(session: Session): void {
    if (
      this.now() - session.createdAt >= this.limits.maxMs ||
      session.turn >= this.limits.maxTurns
    )
      throw new AppError(
        'SESSION_LIMIT',
        'This call reached its limit. Start a new call.',
      );
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
    try {
      return await run(session);
    } finally {
      this.busy.delete(id);
    }
  }
  remove(id: string): void {
    this.sessions.delete(id);
  }
  count(): number {
    this.prune();
    return this.sessions.size;
  }
  private prune(): void {
    for (const [id, session] of this.sessions)
      if (
        !this.busy.has(id) &&
        this.now() - session.createdAt >= this.limits.ttlMs
      )
        this.sessions.delete(id);
  }
}
