import { describe, expect, it, vi } from 'vitest';
import { openVoiceSession } from '@/lib/client/session-api';
import { wavFixture } from '../voice/fixtures';

describe('server voice session client', () => {
  it('requests English-India without credentials in the request and validates the greeting response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        sessionId: '11111111-1111-4111-8111-111111111111',
        greeting: {
          text: 'Hello, I am an AI assistant.',
          audioB64: wavFixture({ sampleRate: 24000 }).toString('base64'),
          mime: 'audio/wav',
        },
        snapshot: {},
        config: { maxUtteranceMs: 28000, maxQuestions: 3, bargeIn: false },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    expect(
      (await openVoiceSession(new AbortController().signal)).sessionId,
    ).toBe('11111111-1111-4111-8111-111111111111');
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/session');
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      '{"lang":"en-IN","mode":"call"}',
    );
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).has(
        'api-subscription-key',
      ),
    ).toBe(false);
  });
  it('rejects malformed server session payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ sessionId: 'fabricated' })),
    );
    await expect(
      openVoiceSession(new AbortController().signal),
    ).rejects.toMatchObject({ code: 'STREAM_INVALID' });
  });
});
