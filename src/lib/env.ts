/**
 * Environment variable validation — validates at import time.
 * Import from `@/lib/env` instead of using `process.env` directly.
 */

function required(name: string): string {
  const value = process.env[name];
  // During `next build`, runtime env vars are not injected into the Docker build
  // context — skip validation so the build succeeds. The missing value is caught
  // immediately on first request at runtime when the container boots.
  if (!value && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function optionalInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

function optionalWarn(name: string): string | undefined {
  const value = process.env[name];
  if (!value && typeof globalThis !== "undefined") {
    console.warn(
      `[env] Warning: ${name} is not set. Some features may be unavailable.`
    );
  }
  return value;
}

// --- Required ---
export const DATABASE_URL = required("DATABASE_URL");
/** Prisma uses this directly from the environment; validated here for fast-fail. */
export const SUNOFLOW_DATABASE_URL = required("SUNOFLOW_DATABASE_URL");
export const AUTH_SECRET = required("AUTH_SECRET");
export const NEXTAUTH_URL = optional("NEXTAUTH_URL", "http://localhost:3000");

// --- Optional with defaults ---
export const SUNOAPI_KEY = optionalWarn("SUNOAPI_KEY");
export const SUNO_API_TIMEOUT_MS = optionalInt("SUNO_API_TIMEOUT_MS", 30_000);
export const RATE_LIMIT_MAX_GENERATIONS = optionalInt("RATE_LIMIT_MAX_GENERATIONS", 10);

// --- Security (optional) ---
/**
 * Comma-separated list of allowed CORS origins, e.g. "https://app.example.com,https://staging.example.com".
 * When unset, no Access-Control-Allow-Origin header is added (same-origin only).
 */
export const ALLOWED_ORIGINS: string[] =
  process.env.ALLOWED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? [];

// --- Observability (optional) ---
/** Sentry DSN for server-side error tracking. Leave unset to disable Sentry. */
export const SENTRY_DSN = process.env.SENTRY_DSN;
/** Sentry DSN exposed to the browser for client-side error tracking. */
export const NEXT_PUBLIC_SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
/** Pino log level override (trace|debug|info|warn|error|fatal). */
export const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

export const env = {
  DATABASE_URL,
  SUNOFLOW_DATABASE_URL,
  AUTH_SECRET,
  NEXTAUTH_URL,
  SUNOAPI_KEY,
  SUNO_API_TIMEOUT_MS,
  RATE_LIMIT_MAX_GENERATIONS,
  ALLOWED_ORIGINS,
  SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_DSN,
  LOG_LEVEL,
} as const;
