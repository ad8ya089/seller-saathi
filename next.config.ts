import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  agentRules: false,
  poweredByHeader: false,
};

export default nextConfig;
