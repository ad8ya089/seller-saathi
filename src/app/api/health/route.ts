import appPackage from '../../../../package.json';
import { getConfig } from '@/lib/server/config';
import { healthResponseSchema, notFoundSchema } from '@/lib/server/health';
import { currentSessionCount } from '@/lib/server/session-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const headers = { 'Cache-Control': 'no-store' };
  if (new URL(request.url).searchParams.has('verbose'))
    return Response.json(notFoundSchema.parse({ error: 'NOT_FOUND' }), {
      status: 404,
      headers,
    });
  let ok = true;
  let providers = { gemini: false, sarvam: false };
  let sessions = 0;
  try {
    providers = getConfig().providers;
    sessions = currentSessionCount();
  } catch {
    ok = false;
  }
  const body = healthResponseSchema.parse({
    ok,
    version: appPackage.version,
    uptimeS: Math.floor(process.uptime()),
    providers,
    sessions,
  });
  return Response.json(body, { status: ok ? 200 : 503, headers });
}
