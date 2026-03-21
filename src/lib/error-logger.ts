/**
 * Structured error logger.
 * Logs errors to the console with a consistent format: timestamp, route, error details.
 */
export function logError(
  source: string,
  error: unknown,
  route?: string
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    source,
    route: route ?? (typeof window !== "undefined" ? window.location.pathname : "unknown"),
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error),
  };

  console.error("[SunoFlow Error]", JSON.stringify(entry, null, 2));
}

/**
 * Structured server-side error logger with request context.
 * Use in API routes to log errors with userId and request parameters.
 */
export function logServerError(
  source: string,
  error: unknown,
  context: {
    userId?: string;
    route: string;
    params?: Record<string, unknown>;
  }
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    source,
    route: context.route,
    userId: context.userId ?? "unknown",
    params: context.params ?? {},
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error),
  };

  console.error("[SunoFlow ServerError]", JSON.stringify(entry, null, 2));
}
