/**
 * Structured client-side error logger.
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
