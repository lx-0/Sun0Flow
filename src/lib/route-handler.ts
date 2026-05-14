import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveUser, requireAdmin } from "@/lib/auth";
import { getClientIp } from "@/lib/network";
import { notFound, rateLimited } from "@/lib/api-error";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import type { Result } from "@/lib/result";
import {
  runRoutePipeline,
  type RouteOptions,
  type SegmentData,
} from "@/lib/route-pipeline";

export type AuthContext = {
  userId: string;
  isApiKey: boolean;
  isAdmin: boolean;
};

export type OptionalAuthContext = {
  userId: string | null;
  isApiKey: boolean;
  isAdmin: boolean;
};

export type AdminContext = {
  adminId: string;
};

export type AnonContext = {
  ip: string;
};

type RateLimitConfig = {
  action: string;
  limit: number;
  windowMs: number;
};

type PipelineCtx<P extends Record<string, string>, B, Q> = {
  params: P;
  body: B;
  query: Q;
};

function executeWithPipeline<
  P extends Record<string, string>,
  B,
  Q,
>(
  request: NextRequest,
  segmentData: SegmentData<P>,
  options: RouteOptions & { body?: z.ZodType<B>; query?: z.ZodType<Q> } | undefined,
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

// ---------------------------------------------------------------------------
// Public route wrappers — each handles only its auth strategy, then delegates
// ---------------------------------------------------------------------------

export function authRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { auth: AuthContext; params: P; body: B; query: Q }
  ) => Promise<Response>,
  options?: RouteOptions & { body?: z.ZodType<B>; query?: z.ZodType<Q> }
) {
  return async (
    request: NextRequest,
    segmentData: SegmentData<P>
  ): Promise<Response> => {
    const result = await resolveUser(request);
    if (result.error) return result.error;

    return executeWithPipeline(
      request,
      segmentData,
      options,
      "route-handler",
      { userId: result.userId },
      ({ params, body, query }) =>
        handler(request, {
          auth: {
            userId: result.userId,
            isApiKey: result.isApiKey,
            isAdmin: result.isAdmin,
          },
          params,
          body,
          query,
        }),
    );
  };
}

export function optionalAuthRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { auth: OptionalAuthContext; params: P; body: B; query: Q }
  ) => Promise<Response>,
  options?: RouteOptions & { body?: z.ZodType<B>; query?: z.ZodType<Q> }
) {
  return async (
    request: NextRequest,
    segmentData: SegmentData<P>
  ): Promise<Response> => {
    const result = await resolveUser(request);
    const auth: OptionalAuthContext = result.error
      ? { userId: null, isApiKey: false, isAdmin: false }
      : { userId: result.userId, isApiKey: result.isApiKey, isAdmin: result.isAdmin };

    return executeWithPipeline(
      request,
      segmentData,
      options,
      "optional-auth-route-handler",
      { userId: auth.userId },
      ({ params, body, query }) =>
        handler(request, { auth, params, body, query }),
    );
  };
}

export function publicRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { params: P; body: B; query: Q }
  ) => Promise<Response>,
  options?: RouteOptions & { body?: z.ZodType<B>; query?: z.ZodType<Q> }
) {
  return async (
    request: NextRequest,
    segmentData: SegmentData<P>
  ): Promise<Response> => {
    return executeWithPipeline(
      request,
      segmentData,
      options,
      "public-route-handler",
      {},
      ({ params, body, query }) =>
        handler(request, { params, body, query }),
    );
  };
}

export function adminRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { admin: AdminContext; params: P; body: B; query: Q }
  ) => Promise<Response>,
  options?: RouteOptions & { body?: z.ZodType<B>; query?: z.ZodType<Q> }
) {
  return async (
    request: NextRequest,
    segmentData: SegmentData<P>
  ): Promise<Response> => {
    const { error, user } = await requireAdmin();
    if (error) return error;

    return executeWithPipeline(
      request,
      segmentData,
      options,
      "admin-route-handler",
      { userId: user!.id },
      ({ params, body, query }) =>
        handler(request, { admin: { adminId: user!.id }, params, body, query }),
    );
  };
}

export function anonRoute<
  P extends Record<string, string> = Record<string, never>,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { anon: AnonContext; params: P; query: Q }
  ) => Promise<Response>,
  options: RouteOptions & { rateLimit: RateLimitConfig; query?: z.ZodType<Q> }
) {
  return async (
    request: NextRequest,
    segmentData: SegmentData<P>
  ): Promise<Response> => {
    const ip = getClientIp(request);

    const { acquired } = await acquireAnonRateLimitSlot(
      ip,
      options.rateLimit.action,
      options.rateLimit.limit,
      options.rateLimit.windowMs,
    );
    if (!acquired) {
      return rateLimited("Too many requests. Try again later.", undefined, {
        "Retry-After": String(Math.ceil(options.rateLimit.windowMs / 1000)),
      });
    }

    return executeWithPipeline(
      request,
      segmentData,
      options,
      "anon-route-handler",
      {},
      ({ params, query }) =>
        handler(request, { anon: { ip }, params, query }),
    );
  };
}

export function cronRoute(
  handler: (request: NextRequest) => Promise<Response>,
  options?: RouteOptions
) {
  return async (request: NextRequest): Promise<Response> => {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    return runRoutePipeline(
      request, undefined, options, "cron-route-handler", {},
      () => handler(request),
    );
  };
}

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
