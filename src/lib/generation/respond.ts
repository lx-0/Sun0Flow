import { NextResponse } from "next/server";
import { logServerError } from "@/lib/error-logger";
import type { GenerationOutcome, TransformOutcome } from "./index";
import { generationOutcomeToResponse } from "./http-response";

interface LogContext {
  label: string;
  userId: string;
  route: string;
  params?: Record<string, unknown>;
}

interface ResponseOptions {
  arrayFormat?: boolean;
  creditBalanceLookup?: () => Promise<number | undefined>;
}

export async function respondToGeneration(
  outcome: GenerationOutcome,
  ctx: LogContext,
  options?: ResponseOptions,
): Promise<NextResponse> {
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
    return generationOutcomeToResponse(outcome, {
      arrayFormat: options?.arrayFormat,
      creditBalance,
      correlationId,
    }) as NextResponse;
  }

  return generationOutcomeToResponse(outcome, {
    arrayFormat: options?.arrayFormat,
  }) as NextResponse;
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
