import { NextRequest } from "next/server";
import { z } from "zod";
import { internalError } from "@/lib/api-error";
import { logServerError } from "@/lib/error-logger";
import {
  parseValidatedBody,
  parseValidatedQuery,
} from "@/lib/route-pipeline/parsers";

export type RouteOptions = {
  route?: string;
};

export type RouteSchemas<B, Q> = {
  body?: z.ZodType<B>;
  query?: z.ZodType<Q>;
};

export type RoutePipelineOptions<B, Q> = RouteOptions & RouteSchemas<B, Q>;

export type SegmentData<P> = { params: Promise<P> };

export async function runRoutePipeline<
  P extends Record<string, string>,
  B,
  Q,
>(
  request: NextRequest,
  segmentData: SegmentData<P> | undefined,
  options: RoutePipelineOptions<B, Q> | undefined,
  logLabel: string,
  logContext: Record<string, unknown>,
  execute: (parsed: { params: P; body: B; query: Q }) => Promise<Response>,
): Promise<Response> {
  try {
    const params = segmentData?.params
      ? await segmentData.params
      : ({} as P);

    let body: B = undefined as B;
    if (options?.body) {
      const parsed = await parseValidatedBody(request, options.body);
      if (parsed.error) return parsed.error;
      body = parsed.data;
    }

    let query: Q = undefined as Q;
    if (options?.query) {
      const parsed = parseValidatedQuery(request, options.query);
      if (parsed.error) return parsed.error;
      query = parsed.data;
    }

    return await execute({ params, body, query });
  } catch (error) {
    logServerError(logLabel, error, {
      ...logContext,
      route: options?.route ?? new URL(request.url).pathname,
    });
    return internalError();
  }
}
