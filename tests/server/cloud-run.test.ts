import { describe, expect, it } from 'vitest';
import { parseConfig } from '@/lib/server/config';
import { peerKey } from '@/lib/server/access';
import { assertSameOrigin } from '@/lib/server/same-origin';

describe('explicit direct Cloud Run proxy mode', () => {
  const config = parseConfig({ PROXY_MODE: 'cloud-run' });
  it.each([
    [undefined, 'unverified-peer'],
    ['', 'unverified-peer'],
    ['bad', 'unverified-peer'],
    ['198.51.100.8', '198.51.100.8'],
    ['2001:db8::8', '2001:db8::8'],
    ['spoofed, 198.51.100.8', '198.51.100.8'],
    ['203.0.113.9, 198.51.100.8', '198.51.100.8'],
    ['203.0.113.9, 2001:db8::8', '2001:db8::8'],
    ['203.0.113.9, bad', 'unverified-peer'],
  ])('uses only the last proxy slot: %s', (forwarded, expected) => {
    const request = new Request('https://demo.run.app', {
      headers: forwarded === undefined ? {} : { 'X-Forwarded-For': forwarded },
    });
    expect(peerKey(request, config)).toBe(expected);
    expect(peerKey(request, parseConfig({}))).toBe('unverified-peer');
  });
  it('accepts normalized internal HTTP only for the same HTTPS run.app authority', () => {
    const request = new Request('http://localhost/api/turn', {
      headers: { Host: 'demo.run.app', Origin: 'https://demo.run.app' },
    });
    expect(() => {
      assertSameOrigin(request, config);
    }).not.toThrow();
    expect(() => {
      assertSameOrigin(request, parseConfig({}));
    }).toThrow();
    expect(() => {
      assertSameOrigin(
        new Request('http://localhost', {
          headers: { Host: 'demo.run.app', Origin: 'https://evil.example' },
        }),
        config,
      );
    }).toThrow();
  });
  it('defaults writable storage to temporary space while preserving explicit volumes', () => {
    expect(parseConfig({}).dataDir).toBe('/tmp/kam');
    expect(parseConfig({ DATA_DIR: '/data' }).dataDir).toBe('/data');
    expect(() => parseConfig({ PROXY_MODE: 'arbitrary' })).toThrow();
  });
});
