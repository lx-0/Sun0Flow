import { NextResponse } from "next/server";
import { logServerError } from "@/lib/error-logger";
import { ErrorCode } from "@/lib/api-error";
import type { GenerationOutcome, TransformOutcome } from "./index";

interface LogContext {
  label: string;
  userId: string;
  route: string;
  params?: Record<string, unknown>;
}

interface ResponseOptions {
  /** Return `{ songs: [song] }` instead of `{ song }`. */
  arrayFormat?: boolean;
  /** Called on payment-related failures (e.g. 402) to include remaining balance. */
  creditBalanceLookup?: () => Promise<number | undefined>;
}

function songPayload(song: unknown, arrayFormat?: boolean) {
  return arrayFormat ? { songs: [song] } : { song };
}

export async function respondToGeneration(
  outcome: GenerationOutcome,
  ctx: LogContext,
  options?: ResponseOptions,
): Promise<NextResponse> {
  if (outcome.status === "denied") return outcome.response as NextResponse;

  if (outcome.status === "queued") {
    return NextResponse.json(
      { queued: true, message: outcome.message, code: ErrorCode.SERVICE_UNAVAILABLE },
      { status: 503 },
    );
  }

  if (outcome.status === "failed") {
    const correlationId = logServerError(ctx.label, outcome.rawError, {
      userId: ctx.userId,
      route: ctx.route,
      params: ctx.params,
    });

    let creditBalance: number | undefined;
    if (options?.creditBalanceLookup) {
      creditBalance = await options.creditBalanceLookup().catch(() => undefined);
    }

    return NextResponse.json(
      {
        ...songPayload(outcome.song, options?.arrayFormat),
        error: outcome.error,
        ...(creditBalance !== undefined && { creditBalance }),
        rateLimit: outcome.rateLimitStatus,
        correlationId,
      },
      { status: 201 },
    );
  }

  return NextResponse.json(
    { ...songPayload(outcome.song, options?.arrayFormat), rateLimit: outcome.rateLimitStatus },
    { status: 201 },
  );
}

interface TransformMeta {
  songId: string;
  format: string;
}

export function respondToTransform(
  outcome: TransformOutcome,
  ctx: LogContext,
  meta: TransformMeta,
): NextResponse {
  if (outcome.status === "denied") return outcome.response as NextResponse;

  if (outcome.status === "failed") {
    logServerError(ctx.label, outcome.rawError, {
      userId: ctx.userId,
      route: ctx.route,
    });
    return NextResponse.json(
      { error: outcome.error, rateLimit: outcome.rateLimitStatus },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      taskId: outcome.taskId,
      status: outcome.mockMode ? "ready" : "pending",
      songId: meta.songId,
      format: meta.format,
      rateLimit: outcome.rateLimitStatus,
    },
    { status: 200 },
  );
}
