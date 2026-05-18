import { NextResponse } from "next/server";
import { errorFromResult, type ApiFailureResult } from "@/lib/api-error";

type SuccessResult = { ok: true };

export function respondWithResult<TSuccess extends SuccessResult, TBody>(
  result: TSuccess | ApiFailureResult,
  mapSuccess: (success: TSuccess) => TBody,
): NextResponse {
  if (!result.ok) {
    return errorFromResult(result);
  }

  return NextResponse.json(mapSuccess(result));
}
