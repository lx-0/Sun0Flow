import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import createNextIntlPlugin from "next-intl/plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// @babel/runtime-corejs3 references core-js-pure paths that were removed in
// core-js-pure >= 3.38.0. Stub them with local files that return native
// browser globals so the build succeeds without downgrading core-js-pure.
// @babel/runtime-corejs3 references specific core-js-pure paths that map to
// named native globals. The generic catch-all (noop) handles anything else.
const corejs3Stubs = {
  "core-js-pure/features/weak-map/index.js": path.resolve(__dirname, "src/lib/core-js-stubs/weak-map.js"),
  "core-js-pure/features/symbol/index.js": path.resolve(__dirname, "src/lib/core-js-stubs/symbol.js"),
  "core-js-pure/features/symbol/iterator.js": path.resolve(__dirname, "src/lib/core-js-stubs/symbol-iterator.js"),
  "core-js-pure/features/object/define-property.js": path.resolve(__dirname, "src/lib/core-js-stubs/object-define-property.js"),
  "core-js-pure/features/object/get-own-property-descriptor.js": path.resolve(__dirname, "src/lib/core-js-stubs/object-get-own-property-descriptor.js"),
  "core-js-pure/features/instance/bind.js": path.resolve(__dirname, "src/lib/core-js-stubs/instance-bind.js"),
  "core-js-pure/features/object/assign.js": path.resolve(__dirname, "src/lib/core-js-stubs/object-assign.js"),
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Enable gzip/brotli compression for all responses
  compress: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "node-cron"],
  experimental: {},
  webpack(config, { isServer, nextRuntime, webpack: wp }) {
    // Edge runtime (middleware) can't resolve Node.js builtins like fs/path.
    // Server-only modules (audio-cache.ts) use them but only execute under
    // the Node.js runtime; provide empty fallbacks so the edge bundle builds.
    if (nextRuntime === "edge") {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      ...corejs3Stubs,
    };

    // Catch-all: redirect any remaining core-js-pure/features/* imports that
    // are not covered by the explicit aliases above to a noop stub.
    // @babel/runtime-corejs3 generates these for polyfills that modern runtimes
    // already have natively (WeakMap, Symbol, Object.*, etc.).
    config.plugins.push(
      new wp.NormalModuleReplacementPlugin(
        /core-js-pure\/features\//,
        (resource) => {
          const stubsDir = path.resolve(__dirname, "src/lib/core-js-stubs");
          const alreadyStubbed = Object.values(corejs3Stubs).some(
            (abs) => resource.request.endsWith(path.basename(abs))
          );
          if (!alreadyStubbed) {
            resource.request = path.join(stubsDir, "noop.js");
          }
        }
      )
    );

    // node-cron uses Node.js built-ins (child_process, stream) that are not
    // available in the edge runtime. Mark it as external so webpack skips
    // bundling it; it is resolved at runtime by the Node.js server.
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals]),
        "node-cron",
      ];
    }
    return config;
  },
  images: {
    // Prefer AVIF (best compression), fall back to WebP — both serve smaller
    // files than JPEG/PNG which improves LCP on image-heavy pages.
    formats: ["image/avif", "image/webp"],
    // Cache optimized images for 7 days (default is 60s — too short for CDN-hosted covers).
    minimumCacheTTL: 604800,
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
      // OAuth provider avatars (Google, GitHub)
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
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
          "connect-src 'self' https://*.sunoapi.org https://*.aiquickdraw.com https://*.posthog.com https://us.i.posthog.com https://eu.i.posthog.com https://errors.yester.cloud",
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
        // Public audio proxy — cacheable by shared caches (public songs only).
        source: "/api/audio/public/:songId",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600",
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
      {
        // Prompt suggestions — private per-user, short TTL
        source: "/api/suggestions/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=10, must-revalidate",
          },
        ],
      },
      {
        // Service worker — must never be cached by CDN or browser.
        // Browsers check for SW updates on every navigation; if the SW file
        // is cached, users won't receive updates and the SW lifecycle breaks.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
      {
        // PWA manifest — short no-cache TTL so browsers/OS always revalidate.
        // Cached manifests can prevent name, icon, or theme updates from
        // reaching installed PWA users.
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache",
          },
        ],
      },
      {
        // Offline fallback page — should always reflect the latest HTML.
        source: "/offline.html",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache",
          },
        ],
      },
    ];
  },
};

let config = withNextIntl(nextConfig);

// Bundle analysis workflow:
//   Run `pnpm analyze` locally to generate an interactive treemap of client and
//   server bundles. Opens browser tabs at .next/analyze/client.html (and server).
//
//   CI bundle size tracking uses scripts/bundle-size.mjs, which reads
//   .next/static/chunks/ directly (no visual report needed for automation):
//     node scripts/bundle-size.mjs --output bundle-size-report.json
//   Compare against a saved baseline and fail on >10% regression:
//     node scripts/bundle-size.mjs --baseline bundle-size-baseline.json --output bundle-size-report.json
if (process.env.ANALYZE === "true") {
  const withBundleAnalyzer = (await import("@next/bundle-analyzer")).default;
  config = withBundleAnalyzer({ enabled: true })(config);
}

// Wrap with Sentry only when a DSN is provided — zero overhead otherwise
const sentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  const { withSentryConfig } = await import("@sentry/nextjs");
  // Derive release name from explicit env var, then Railway-injected commit SHA
  const sentryRelease =
    process.env.SENTRY_RELEASE ?? process.env.RAILWAY_GIT_COMMIT_SHA;
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
    release: sentryRelease ? { name: sentryRelease } : undefined,
  });
}

export default config;
