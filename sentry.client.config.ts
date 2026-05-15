/**
 * Sentry client-side (browser) configuration.
 * Only active when NEXT_PUBLIC_SENTRY_DSN is set.
 *
 * The DSN may point at Sentry SaaS or a self-hosted, Sentry-protocol-compatible
 * backend such as GlitchTip. GlitchTip supports error + performance envelopes
 * but rejects Session Replay, so `replayIntegration()` is intentionally omitted
 * for portability.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "production",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: 0.1,
  });
}
