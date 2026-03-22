/**
 * Environment variable validation — validates at import time.
 * Import from `@/lib/env` instead of using `process.env` directly.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
export const AUTH_SECRET = required("AUTH_SECRET");
export const NEXTAUTH_URL = optional("NEXTAUTH_URL", "http://localhost:3000");

// --- Optional with defaults ---
export const SUNOAPI_KEY = optionalWarn("SUNOAPI_KEY");
export const SUNO_API_TIMEOUT_MS = optionalInt("SUNO_API_TIMEOUT_MS", 30_000);
export const RATE_LIMIT_MAX_GENERATIONS = optionalInt("RATE_LIMIT_MAX_GENERATIONS", 10);

export const env = {
  DATABASE_URL,
  AUTH_SECRET,
  NEXTAUTH_URL,
  SUNOAPI_KEY,
  SUNO_API_TIMEOUT_MS,
  RATE_LIMIT_MAX_GENERATIONS,
} as const;
