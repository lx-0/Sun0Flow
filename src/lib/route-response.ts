import { NextResponse } from "next/server";
import { notFound } from "@/lib/api-error";
import type { Result } from "@/lib/result";

/**
 * Verify that a fetched record belongs to the authenticated user.
 * Returns the narrowed record on success, or a 404 error response.
 * Combines null-check and userId comparison so callers never leak
 * whether a resource exists to non-owners.
 */
export function requireOwned<T extends { userId: string }>(
  record: T | null,
  userId: string,
  label = "Resource",
): { data: T; error?: never } | { data?: never; error: NextResponse } {
  if (!record || record.userId !== userId) {
    return { error: notFound(`${label} not found`) };
  }
  return { data: record };
}

/**
 * Convert a Result<T> into a NextResponse. Centralises the
 * ok / error → JSON mapping that was previously duplicated in 35+ routes.
 */
export function resultResponse<T>(
  result: Result<T>,
  options?: { status?: number; headers?: HeadersInit },
): NextResponse {
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data, options);
}
