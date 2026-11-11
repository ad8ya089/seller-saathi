import { expect, it } from 'vitest';
import { parseConfig } from '@/lib/server/config';
import { peerKey } from '@/lib/server/access';
import { assertSameOrigin } from '@/lib/server/same-origin';

const domain = 'http--seller-saathi--synthetic.code.run';
const config = parseConfig({ DOMAIN: domain, PROXY_MODE: 'caddy' });
it('accepts only the configured Northflank HTTPS authority after HTTP normalization', () => {
  expect(() => {
    assertSameOrigin(
      new Request('http://localhost/api/turn', {
        headers: { Host: domain, Origin: `https://${domain}` },
      }),
      config,
    );
  }).not.toThrow();
});
it('does not promote Northflank caller forwarding headers into rate-limit identity', () => {
  const request = new Request(`https://${domain}`, {
    headers: {
      'X-Forwarded-For': '203.0.113.1, 198.51.100.2',
      'X-Real-IP': '198.51.100.2',
      'X-Internal-Proxy-Token': 'caller-spoof',
    },
  });
  expect(peerKey(request, config)).toBe('unverified-peer');
});
it('rejects a foreign origin even with forged forwarded authority', () => {
  expect(() => {
    assertSameOrigin(
      new Request('http://localhost/api/turn', {
        headers: {
          Host: domain,
          Origin: 'https://evil.example',
          'X-Forwarded-Host': domain,
          'X-Forwarded-Proto': 'https',
        },
      }),
      config,
    );
  }).toThrow();
});
it('fails closed when the platform HTTPS hostname has not been configured', () => {
  expect(() => {
    assertSameOrigin(
      new Request('http://localhost/api/turn', {
        headers: { Host: domain, Origin: `https://${domain}` },
      }),
      parseConfig({}),
    );
  }).toThrow();
});
