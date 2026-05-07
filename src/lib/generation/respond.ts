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

export function respondToGeneration(
  outcome: GenerationOutcome,
  ctx: LogContext,
): NextResponse {
  if (outcome.status === "denied") return outcome.response as NextResponse;

  if (outcome.status === "queued") {
    return NextResponse.json(
      { queued: true, message: outcome.message, code: ErrorCode.SERVICE_UNAVAILABLE },
      { status: 503 },
    );
  }

  if (outcome.status === "failed") {
    logServerError(ctx.label, outcome.rawError, {
      userId: ctx.userId,
      route: ctx.route,
      params: ctx.params,
    });
    return NextResponse.json(
      { song: outcome.song, error: outcome.error, rateLimit: outcome.rateLimitStatus },
      { status: 201 },
    );
  }

  return NextResponse.json(
    { song: outcome.song, rateLimit: outcome.rateLimitStatus },
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
