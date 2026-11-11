import type { NextConfig } from 'next';
import { securityHeaders, vadHeaders } from './src/lib/security-headers';
import type { HttpHeader } from './src/lib/security-headers';

const nextConfig: NextConfig = {
  output: 'standalone',
  agentRules: false,
  poweredByHeader: false,
  compress: false,
  headers: (): Promise<{ source: string; headers: HttpHeader[] }[]> =>
    Promise.resolve([
      { source: '/:path*', headers: securityHeaders },
      ...vadHeaders,
    ]),
};

export default nextConfig;
