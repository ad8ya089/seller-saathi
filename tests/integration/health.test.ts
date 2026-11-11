import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('GEMINI_API_KEY', '');
  vi.stubEnv('SARVAM_API_KEY', '');
  vi.stubEnv('PORT', '3000');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/health', () => {
  it('restricts verbose diagnostics to the configured internal bearer context', async () => {
    vi.stubEnv('INTERNAL_METRICS_TOKEN', 'private-metrics-test-token');
    const { GET } = await import('@/app/api/health/route');
    expect(
      GET(
        new Request('http://localhost/api/health?verbose=1', {
          headers: { 'X-Forwarded-For': '127.0.0.1' },
        }),
      ).status,
    ).toBe(404);
    const accepted = GET(
      new Request('http://localhost/api/health?verbose=1', {
        headers: { Authorization: 'Bearer private-metrics-test-token' },
      }),
    );
    expect(accepted.status).toBe(200);
    const text = await accepted.text();
    expect(text).toContain('totalTurns');
    expect(text).not.toContain('private-metrics-test-token');
  });
  it('is healthy without optional provider credentials and matches the documented contract', async () => {
    const { GET, runtime, dynamic } = await import('@/app/api/health/route');
    const { healthResponseSchema } = await import('@/lib/server/health');
    const response = GET(new Request('http://localhost/api/health'));
    const body = healthResponseSchema.parse(await response.json());
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      version: '0.1.0',
      providers: { gemini: false, sarvam: false },
      sessions: 0,
    });
    expect(body.uptimeS).toBeGreaterThanOrEqual(0);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
  });
  it('reports configured status without exposing credentials or settings', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'health-test-gemini');
    vi.stubEnv('SARVAM_API_KEY', 'health-test-sarvam');
    const { GET } = await import('@/app/api/health/route');
    const response = GET(new Request('http://localhost/api/health'));
    const text = await response.text();
    expect(text).toContain('"gemini":true');
    expect(text).toContain('"sarvam":true');
    expect(text).not.toContain('health-test');
    expect(text).not.toContain('API_KEY');
  });
  it('does not call provider HTTP even when both provider flags are configured', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'health-test-gemini');
    vi.stubEnv('SARVAM_API_KEY', 'health-test-sarvam');
    const network = vi.fn(() => {
      throw new Error('Provider I/O must not run in health');
    });
    vi.stubGlobal('fetch', network);
    const { GET } = await import('@/app/api/health/route');
    const response = GET(new Request('http://localhost/api/health'));
    expect(response.status).toBe(200);
    expect(network).not.toHaveBeenCalled();
  });
  it('returns a predictable sanitized 503 for invalid explicit configuration', async () => {
    vi.stubEnv('PORT', 'private-invalid-port');
    const { GET } = await import('@/app/api/health/route');
    const response = GET(new Request('http://localhost/api/health'));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain('"ok":false');
    expect(text).not.toContain('private-invalid-port');
    expect(text).not.toContain('stack');
  });
  it('keeps the later verbose endpoint unavailable', async () => {
    const { GET } = await import('@/app/api/health/route');
    expect(
      GET(new Request('http://localhost/api/health?verbose=1')).status,
    ).toBe(404);
  });
});
