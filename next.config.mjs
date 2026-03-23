/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
  async headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://*.sunoapi.org https://*.removeai.ai https://*.redpandaai.co",
          "media-src 'self' blob: https://*.sunoapi.org",
          "font-src 'self' data:",
          "connect-src 'self' https://*.sunoapi.org",
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
  config = withBundleAnalyzer({ enabled: true })(nextConfig);
}

export default config;
