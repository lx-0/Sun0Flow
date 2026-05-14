import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, internalError } from "@/lib/api-error";
import { logServerError } from "@/lib/error-logger";
import { parseQueryParams } from "@/lib/query-params";

export type RouteOptions = {
  route?: string;
};

export type SegmentData<P> = { params: Promise<P> };

async function parseBody<B>(
  request: NextRequest,
  schema: z.ZodType<B>
): Promise<{ data: B; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: badRequest("Invalid JSON body") };
  }
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

export async function runRoutePipeline<
  P extends Record<string, string>,
  B,
  Q,
>(
  request: NextRequest,
  segmentData: SegmentData<P> | undefined,
  options: RouteOptions & { body?: z.ZodType<B>; query?: z.ZodType<Q> } | undefined,
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
      const parsed = await parseBody(request, options.body);
      if (parsed.error) return parsed.error;
      body = parsed.data;
    }

    let query: Q = undefined as Q;
    if (options?.query) {
      const parsed = parseQueryParams(
        request.nextUrl.searchParams,
        options.query,
      );
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
