import { z } from "zod";
import { badRequest } from "@/lib/api-error";
import type { NextResponse } from "next/server";

/**
 * Zod transforms for parsing URLSearchParams values.
 *
 * Each transform handles the full string → typed-value pipeline:
 * empty/missing → undefined/default, invalid → fallback, valid → typed value.
 */

export const zTrimmedParam = z
  .string()
  .optional()
  .transform((v): string | undefined => v?.trim() || undefined);

export const zIntParam = z
  .string()
  .optional()
  .transform((v): number | undefined => {
    if (!v) return undefined;
    const n = parseInt(v, 10);
    return isNaN(n) ? undefined : n;
  });

export function zPageParam(fallback = 1) {
  return z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return fallback;
      const n = parseInt(v, 10);
      return isNaN(n) || n < 1 ? fallback : n;
    });
}

export function zLimitParam(fallback = 20, max = 100) {
  return z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return fallback;
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 1) return fallback;
      return Math.min(n, max);
    });
}

export function zPaginationQuery(fallbackLimit = 20, maxLimit = 100) {
  return z.object({
    page: zPageParam(1),
    limit: zLimitParam(fallbackLimit, maxLimit),
  });
}

export const zCursorParam = z
  .string()
  .optional()
  .transform((v): string | undefined => v || undefined);

export const zCsvParam = z
  .string()
  .optional()
  .transform(
    (v): string[] =>
      v
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
  );

export const zBoolParam = z
  .string()
  .optional()
  .transform((v): boolean => v === "true");

export function zEnumParam<T extends string>(values: readonly T[], fallback: T) {
  return z
    .string()
    .optional()
    .transform((v): T => (values.includes(v as T) ? (v as T) : fallback));
}

export function zOffsetParam(fallback = 0) {
  return z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return fallback;
      const n = parseInt(v, 10);
      return isNaN(n) || n < 0 ? fallback : n;
    });
}

export function parseQueryParams<Q>(
  searchParams: URLSearchParams,
  schema: z.ZodType<Q>,
): { data: Q; error?: never } | { data?: never; error: NextResponse } {
  const raw = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues.map((i) => {
      const path = i.path.join(".");
      return path ? `${path}: ${i.message}` : i.message;
    });
    return { error: badRequest(messages.join("; ")) };
  }
  return { data: result.data };
}
