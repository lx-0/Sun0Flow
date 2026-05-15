import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { logger } from "@/lib/logger";

export const GET = adminRoute(async () => {
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
}, { route: "/api/admin/sentry-test" });
