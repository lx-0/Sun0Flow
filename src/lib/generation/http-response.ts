import { NextResponse } from "next/server";
import { ErrorCode } from "@/lib/api-error";
import type { GenerationOutcome } from "./execute";

export interface GenerationResponseOptions {
  arrayFormat?: boolean;
  creditBalance?: number;
  correlationId?: string;
  includeServiceUnavailableCode?: boolean;
}

function songPayload(song: unknown, arrayFormat?: boolean) {
  return arrayFormat ? { songs: [song] } : { song };
}

export function generationOutcomeToResponse(
  outcome: GenerationOutcome,
  options?: GenerationResponseOptions,
): NextResponse | null {
  if (outcome.status === "denied") return outcome.response as NextResponse;

  if (outcome.status === "queued") {
    return NextResponse.json(
      {
        queued: true,
        message: outcome.message,
        ...(options?.includeServiceUnavailableCode !== false && {
          code: ErrorCode.SERVICE_UNAVAILABLE,
        }),
      },
      { status: 503 },
    );
  }

  if (outcome.status === "failed") {
    return NextResponse.json(
      {
        ...songPayload(outcome.song, options?.arrayFormat),
        error: outcome.error,
        ...(options?.creditBalance !== undefined && {
          creditBalance: options.creditBalance,
        }),
        rateLimit: outcome.rateLimitStatus,
        ...(options?.correlationId && { correlationId: options.correlationId }),
      },
      { status: 201 },
    );
  }

  if (outcome.status === "created") {
    return NextResponse.json(
      {
        ...songPayload(outcome.song, options?.arrayFormat),
        rateLimit: outcome.rateLimitStatus,
      },
      { status: 201 },
    );
  }

  return null;
}
