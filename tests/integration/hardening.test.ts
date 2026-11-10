import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SessionStore } from '@/lib/server/session-store';
import type { AgentEnvironmentFactory } from '@/lib/server/turn-service';
import { TurnService } from '@/lib/server/turn-service';
import { TokenBucket, DailyBudget } from '@/lib/server/rate-limit';
import { parseConfig } from '@/lib/server/config';
import {
  createTurnHandler,
  createSessionHandler,
  createConfirmHandler,
} from '@/lib/server/agent-api';
import type { AgentServices } from '@/lib/server/agent-api';
import { assertAccess, peerKey } from '@/lib/server/access';
import { assertSameOrigin } from '@/lib/server/same-origin';
import { GreetingCache } from '@/lib/server/greeting';
import { FakeStt, FakeTts } from '@/lib/voice/fakes';
import { FakeLlm } from '@/lib/llm/fake';
import type { EchoEvent } from '@/lib/voice/events';
import { fixture } from '../fixtures';
import { wavFixture } from '../voice/fixtures';

function rig(cap = 1): {
  services: AgentServices;
  factory: ReturnType<typeof vi.fn<AgentEnvironmentFactory>>;
  stt: FakeStt;
} {
  const sessions = new SessionStore();
  const stt = new FakeStt({ text: '' });
  const tts = new FakeTts(wavFixture({ sampleRate: 24000 }));
  const config = parseConfig({
    GEMINI_API_KEY: 'fake',
    SARVAM_API_KEY: 'fake',
  });
  const tools = {
    data: fixture,
    today: new Date('2026-11-11T00:00:00Z'),
    now: (): Date => new Date(),
    createPlanId: randomUUID,
    append: (): Promise<void> =>
      Promise.reject(new Error('No writes expected')),
  };
  const factory = vi
    .fn()
    .mockResolvedValue({ llm: new FakeLlm([]), stt, tts, tools });
  const budget = new DailyBudget(cap);
  return {
    services: {
      config,
      sessions,
      budget,
      limiter: new TokenBucket(1, 600000),
      turns: new TurnService(sessions, factory, Date.now, undefined, () => {
        budget.accept();
      }),
      greeting: new GreetingCache(tts),
      data: () => Promise.resolve(fixture),
      toolEnvironment: () => Promise.resolve(tools),
      ledger: () => Promise.resolve([]),
    },
    factory,
    stt,
  };
}
describe('offline hardening boundaries', () => {
  it('allows two empty-speech reprompts then directs the seller to text without consuming conversation turns', async () => {
    const { services, stt } = rig(800);
    const session = services.sessions.create();
    const codes: string[] = [];
    for (let index = 0; index < 3; index += 1)
      await services.turns.run(
        {
          kind: 'audio',
          sessionId: session.id,
          turnId: randomUUID(),
          wav: wavFixture(),
        },
        (event): void => {
          if (event.event === 'error') codes.push(event.data.code);
        },
        new AbortController().signal,
      );
    expect(codes).toEqual(['NO_SPEECH', 'NO_SPEECH', 'TEXT_REQUIRED']);
    expect(session.history).toEqual([]);
    expect(session.turn).toBe(0);
    expect(session.counters.llmCalls).toBe(0);
    expect(stt.calls).toHaveLength(3);
  });
  it('counts one accepted empty attempt, retains no history and blocks providers after the daily cap', async () => {
    const { services, factory } = rig();
    const session = services.sessions.create();
    const events: EchoEvent[] = [];
    const input = {
      kind: 'audio' as const,
      sessionId: session.id,
      turnId: randomUUID(),
      wav: wavFixture(),
    };
    await services.turns.run(
      input,
      (event) => {
        events.push(event);
      },
      new AbortController().signal,
    );
    expect(session.history).toEqual([]);
    expect(session.turn).toBe(0);
    expect(events.find((event) => event.event === 'fallback')).toMatchObject({
      event: 'fallback',
      data: { kind: 'stt' },
    });
    await services.turns.run(
      input,
      () => undefined,
      new AbortController().signal,
    );
    expect(factory).toHaveBeenCalledOnce();
    await expect(
      services.turns.run(
        { ...input, turnId: randomUUID() },
        () => undefined,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'DAILY_LIMIT' });
    expect(factory).toHaveBeenCalledOnce();
  });
  it('rejects the twenty-sixth turn before constructing providers', async () => {
    const { services, factory } = rig();
    const session = services.sessions.create();
    session.turn = 25;
    await expect(
      services.turns.run(
        {
          kind: 'text',
          sessionId: session.id,
          text: 'Hello',
          turnId: randomUUID(),
        },
        () => undefined,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'SESSION_LIMIT' });
    expect(factory).not.toHaveBeenCalled();
  });
  it('returns typed rate limiting with Retry-After', async () => {
    const { services } = rig();
    const handler = createTurnHandler(services);
    const request = (): Request =>
      new Request('http://localhost/api/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
        },
        body: '{}',
      });
    expect((await handler(request())).status).toBe(400);
    const denied = await handler(request());
    expect(denied.status).toBe(429);
    expect(denied.headers.get('Retry-After')).toBe('600');
  });
  it('gates every POST with the optional server-held code and ignores spoofed forwarded IPs', async () => {
    const { services } = rig();
    services.config = {
      ...services.config,
      demoAccessCode: 'private-test-code',
    };
    for (const handler of [
      createSessionHandler(services),
      createTurnHandler(services),
      createConfirmHandler(services),
    ]) {
      const denied = await handler(
        new Request('http://localhost/api/session', { method: 'POST' }),
      );
      expect(denied.status).toBe(401);
      expect(await denied.text()).not.toContain('private-test-code');
    }
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '1.2.3.4',
        'x-demo-access-code': 'private-test-code',
      },
    });
    expect(() => {
      assertAccess(request, services.config);
    }).not.toThrow();
    expect(peerKey(request, services.config)).toBe('unverified-peer');
    expect(() => {
      assertAccess(new Request('http://localhost'), parseConfig({}));
    }).not.toThrow();
  });
  it('trusts proxy identity only with the configured secret and rejects cross-site requests even with no Origin', () => {
    const config = parseConfig({ TRUSTED_PROXY_TOKEN: 'proxy-secret' });
    expect(
      peerKey(
        new Request('http://localhost', {
          headers: {
            'x-real-ip': '1.2.3.4',
            'x-internal-proxy-token': 'proxy-secret',
          },
        }),
        config,
      ),
    ).toBe('1.2.3.4');
    expect(() => {
      assertSameOrigin(
        new Request('http://localhost', {
          headers: { 'Sec-Fetch-Site': 'cross-site' },
        }),
      );
    }).toThrow();
    expect(() => {
      assertSameOrigin(new Request('http://localhost'));
    }).not.toThrow();
    expect(() => {
      assertSameOrigin(
        new Request('http://localhost', {
          headers: { Origin: 'https://evil.example' },
        }),
      );
    }).toThrow();
  });
});
