import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output for the Docker runtime stage (SPEC §14).
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  images: {
    // Media is served from the R2 public base (custom domain or r2.dev).
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
