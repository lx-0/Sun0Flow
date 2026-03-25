/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Enable gzip/brotli compression for all responses
  compress: true,
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sunoapi.org",
      },
      {
        protocol: "https",
        hostname: "**.removeai.ai",
      },
      {
        protocol: "https",
        hostname: "**.redpandaai.co",
      },
      {
        protocol: "https",
        hostname: "**.sunoapi.org",
      },
    ],
  },
  async rewrites() {
    return {
      // afterFiles: filesystem routes (e.g. /api/v1/openapi.json) match
      // first; only then does this wildcard rewrite kick in so that every
      // other /api/v1/* path is served by the matching /api/* handler.
      // No code duplication — the /api/* route handlers remain the source
      // of truth; v1 paths are a transparent alias.
      afterFiles: [
        { source: "/api/v1/:path*", destination: "/api/:path*" },
      ],
    };
  },

  async headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob: https://*.sunoapi.org https://*.aiquickdraw.com",
          "font-src 'self' data:",
          "connect-src 'self' https://*.sunoapi.org https://*.aiquickdraw.com",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      },
    ];

    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Static assets built by Next.js (JS, CSS) — content-hashed, immutable
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Public static files (icons, manifests, etc.)
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=43200",
          },
        ],
      },
      {
        // Favicon and other root-level static files
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
      {
        // Audio proxy — authenticated endpoint, private browser cache only.
        // Must not be cached by CDN/shared caches (would bypass auth checks).
        source: "/api/audio/:songId",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=3600",
          },
        ],
      },
      {
        // Public song share pages — cacheable
        source: "/s/:slug",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=60, s-maxage=60, stale-while-revalidate=30",
          },
        ],
      },
    ];
  },
};

let config = nextConfig;

if (process.env.ANALYZE === "true") {
  const withBundleAnalyzer = (await import("@next/bundle-analyzer")).default;
  config = withBundleAnalyzer({ enabled: true })(config);
}

// Wrap with Sentry only when a DSN is provided — zero overhead otherwise
const sentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  const { withSentryConfig } = await import("@sentry/nextjs");
  config = withSentryConfig(config, {
    // Suppress noisy Sentry build output unless in CI
    silent: !process.env.CI,
    // Automatically tree-shake Sentry logger statements in production
    disableLogger: true,
    // Upload source maps to Sentry for readable stack traces
    // Requires SENTRY_AUTH_TOKEN to be set
    sourcemaps: {
      disable: !process.env.SENTRY_AUTH_TOKEN,
    },
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
  });
}

export default config;
