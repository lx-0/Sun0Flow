/**
 * Admin-only Sentry verification endpoint.
 *
 * Throws a test error so you can confirm Sentry is capturing server-side
 * exceptions and source maps are correctly uploaded.
 *
 * GET /api/admin/sentry-test
 */
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-resolver";
import { logger } from "@/lib/logger";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const testError = new Error("Sentry verification test — this error is intentional");
  testError.name = "SentryVerificationError";

  // Manually capture so it shows up in Sentry even if global handler is disabled
  const eventId = Sentry.captureException(testError, {
    tags: { source: "sentry-test-endpoint" },
    level: "info",
  });

  logger.info({ sentryEventId: eventId }, "sentry-test: verification error captured");

  return NextResponse.json({
    status: "ok",
    message: "Test error sent to Sentry. Check your Sentry project for a SentryVerificationError.",
    sentryEventId: eventId ?? null,
    sentryConfigured: Boolean(process.env.SENTRY_DSN),
  });
}
