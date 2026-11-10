import { describe, expect, it } from 'vitest';
import { assertSameOrigin } from '@/lib/server/same-origin';

describe('configured deployment origins', () => {
  it('accepts the configured HTTPS origin despite standalone internal HTTP normalization', () => {
    const request = new Request('http://localhost/api/turn', {
      headers: { Host: 'demo.example.com', Origin: 'https://demo.example.com' },
    });
    expect(() => {
      assertSameOrigin(request, { domain: 'demo.example.com' });
    }).not.toThrow();
    expect(() => {
      assertSameOrigin(request);
    }).toThrow();
  });
  it('rejects unrelated hosts, origins and spoofed forwarding headers', () => {
    const request = new Request('http://localhost/api/turn', {
      headers: {
        Host: 'other.example.com',
        Origin: 'https://demo.example.com',
        'X-Forwarded-Host': 'demo.example.com',
        'X-Forwarded-Proto': 'https',
      },
    });
    expect(() => {
      assertSameOrigin(request, { domain: 'demo.example.com' });
    }).toThrow();
  });
});
