import { NextRequest } from "next/server";
import {
  runRoutePipeline,
  type RoutePipelineOptions,
  type SegmentData,
} from "@/lib/route-pipeline";
import type { PipelineCtx, PreflightResult } from "@/lib/route-handler/types";

function executeWithPipeline<P extends Record<string, string>, B, Q>(
  request: NextRequest,
  segmentData: SegmentData<P>,
  options: RoutePipelineOptions<B, Q> | undefined,
  logLabel: string,
  logContext: Record<string, unknown>,
  handler: (ctx: PipelineCtx<P, B, Q>) => Promise<Response>,
): Promise<Response> {
  return runRoutePipeline(
    request,
    segmentData,
    options,
    logLabel,
    logContext,
    handler,
  );
}

export function createRouteWrapper<
  P extends Record<string, string>,
  B,
  Q,
  TContext,
>(
  preflight: (request: NextRequest) => Promise<PreflightResult<TContext>>,
  execute: (
    request: NextRequest,
    context: TContext,
    parsed: PipelineCtx<P, B, Q>,
  ) => Promise<Response>,
  options: RoutePipelineOptions<B, Q> | undefined,
  logLabel: string,
  getLogContext: (context: TContext) => Record<string, unknown>,
) {
  return async (
    request: NextRequest,
    segmentData: SegmentData<P>,
  ): Promise<Response> => {
    const preflightResult = await preflight(request);
    if (!preflightResult.ok) return preflightResult.error;

    return executeWithPipeline(
      request,
      segmentData,
      options,
      logLabel,
      getLogContext(preflightResult.context),
      (parsed) => execute(request, preflightResult.context, parsed),
    );
  };
}
