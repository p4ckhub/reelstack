import type { NextConfig } from 'next';
import path from 'path';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo root - ensures Prisma native binaries in root node_modules are traced
  outputFileTracingRoot: path.join(__dirname, '../../'),
  poweredByHeader: false,
  // Override default serverExternalPackages to exclude ioredis.
  // Bun's flat monorepo layout breaks Node resolution for ioredis subpath imports
  // when treated as external. Bundling it with Next.js fixes the issue.
  serverExternalPackages: ['@prisma/client', 'prisma', 'sharp', 'pino', 'pino-pretty'],
  experimental: {
    proxyClientMaxBodySize: '500mb',
  },
  async headers() {
    const hstsMaxAge = process.env.HSTS_MAX_AGE ?? '63072000'; // 2 years default
    // CSP: allow self, blob: for video, unpkg for FFmpeg.wasm; block everything else
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://eu.altcha.org",
      "style-src 'self' 'unsafe-inline'", // Next.js injects inline styles
      "img-src 'self' blob: data:",
      "font-src 'self'",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "connect-src 'self' blob: https://unpkg.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          // Required for FFmpeg.wasm (SharedArrayBuffer)
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          // Security headers
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS - configurable via HSTS_MAX_AGE env var (set to 0 to disable)
          ...(hstsMaxAge !== '0'
            ? [{ key: 'Strict-Transport-Security', value: `max-age=${hstsMaxAge}; includeSubDomains` }]
            : []),
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
