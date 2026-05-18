import { NextResponse } from "next/server";
import { errorFromResult, type ApiFailureResult } from "@/lib/api-error";

export function respondWithResult<
  TResult extends { ok: boolean },
  TBody,
>(
  result: TResult,
  mapSuccess: (success: Extract<TResult, { ok: true }>) => TBody,
): NextResponse {
  if (!result.ok) {
    return errorFromResult(result as unknown as ApiFailureResult);
  }

  return NextResponse.json(
    mapSuccess(result as Extract<TResult, { ok: true }>),
  );
}
