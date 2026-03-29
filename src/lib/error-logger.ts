/**
 * Structured error logger.
 *
 * Server-side calls go through pino (JSON to stdout).
 * Client-side calls fall back to window.fetch → /api/error-report + Sentry.captureException().
 */
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

function extractErrorInfo(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack?.slice(0, 2048) };
  }
  return { message: String(error) };
}

function reportToServer(source: string, error: unknown, route?: string): void {
  if (typeof window === "undefined") return;

  const { message, stack } = extractErrorInfo(error);

  fetch("/api/error-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      stack,
      url: route ?? window.location.href,
      userAgent: navigator.userAgent,
      source,
    }),
  }).catch(() => {
    // Silently fail — we already logged to console
  });
}

export function logError(
  source: string,
  error: unknown,
  route?: string
): void {
  const { message, stack } = extractErrorInfo(error);

  const entry = {
    source,
    route: route ?? (typeof window !== "undefined" ? window.location.pathname : "unknown"),
    error: stack ? { message, stack } : message,
  };

  // Server-side: structured pino log; client-side: console fallback + report + Sentry
  if (typeof window === "undefined") {
    logger.error(entry, "client-error");
  } else {
    console.error("[SunoFlow Error]", entry);
    reportToServer(source, error, route);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source },
      extra: { route: entry.route },
    });
  }
}

/**
 * Structured server-side error logger with request context.
 * Generates a correlation ID for each log entry to aid debugging.
 * Use in API routes to log errors with userId and request parameters.
 *
 * @returns The correlation ID for this log entry (include in error responses for traceability).
 */
export function logServerError(
  source: string,
  error: unknown,
  context: {
    userId?: string;
    route: string;
    params?: Record<string, unknown>;
    correlationId?: string;
  }
): string {
  const correlationId =
    context.correlationId ??
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  logger.error(
    {
      correlationId,
      source,
      route: context.route,
      userId: context.userId ?? "unknown",
      params: context.params ?? {},
      err: error instanceof Error ? error : new Error(String(error)),
    },
    "server-error"
  );

  return correlationId;
}
