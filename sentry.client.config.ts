/**
 * Sentry client-side (browser) configuration.
 * Only active when NEXT_PUBLIC_SENTRY_DSN is set.
 *
 * Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "production",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    // Capture 10% of sessions for Session Replay in production
    replaysSessionSampleRate: 0.1,
    // Capture 100% of sessions where an error occurs
    replaysOnErrorSampleRate: 1.0,

    // Performance: capture 10% of transactions
    tracesSampleRate: 0.1,

    integrations: [
      Sentry.replayIntegration(),
    ],
  });
}
