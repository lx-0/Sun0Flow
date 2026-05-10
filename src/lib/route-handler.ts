import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveUser, requireAdmin } from "@/lib/auth";
import { logServerError } from "@/lib/error-logger";
import { badRequest, internalError, notFound, rateLimited } from "@/lib/api-error";
import { parseQueryParams } from "@/lib/query-params";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import type { Result } from "@/lib/result";

export type AuthContext = {
  userId: string;
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

type RouteOptions = {
  route?: string;
};

type SegmentData<P> = { params: Promise<P> };

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

/**
 * Wrap an authenticated route handler. Resolves auth, catches unhandled errors,
 * and logs them with request context.
 *
 * Usage (no dynamic params):
 *   export const GET = authRoute(async (request, { auth }) => { ... });
 *
 * Usage (with dynamic params):
 *   export const GET = authRoute<{ id: string }>(async (request, { auth, params }) => { ... });
 *
 * Usage (with body validation):
 *   export const POST = authRoute(async (request, { auth, body }) => {
 *     body.name // typed string
 *   }, { body: z.object({ name: z.string().min(1) }) });
 *
 * Usage (with query validation):
 *   export const GET = authRoute(async (request, { auth, query }) => {
 *     query.page // typed number
 *   }, { query: z.object({ page: zPageParam() }) });
 */
export function authRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { auth: AuthContext; params: P; body: B; query: Q }
  ) => Promise<NextResponse>,
  options?: RouteOptions & { body?: z.ZodType<B>; query?: z.ZodType<Q> }
) {
  return async (
    request: NextRequest,
    segmentData: SegmentData<P>
  ): Promise<NextResponse> => {
    const result = await resolveUser(request);
    if (result.error) return result.error;

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

      return await handler(request, {
        auth: {
          userId: result.userId,
          isApiKey: result.isApiKey,
          isAdmin: result.isAdmin,
        },
        params,
        body,
        query,
      });
    } catch (error) {
      logServerError("route-handler", error, {
        userId: result.userId,
        route: options?.route ?? new URL(request.url).pathname,
      });
      return internalError();
    }
  };
}

/**
 * Wrap an admin route handler. Verifies admin access, catches unhandled errors.
 *
 * Usage:
 *   export const GET = adminRoute(async (request, { admin }) => { ... });
 *   export const PATCH = adminRoute<{ id: string }>(async (request, { admin, params }) => { ... });
 *
 * Usage (with body validation):
 *   export const POST = adminRoute(async (request, { admin, body }) => {
 *     body.title // typed string
 *   }, { body: z.object({ title: z.string() }) });
 *
 * Usage (with query validation):
 *   export const GET = adminRoute(async (request, { admin, query }) => {
 *     query.page // typed number
 *   }, { query: z.object({ page: zPageParam() }) });
 */
export function adminRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { admin: AdminContext; params: P; body: B; query: Q }
  ) => Promise<NextResponse>,
  options?: RouteOptions & { body?: z.ZodType<B>; query?: z.ZodType<Q> }
) {
  return async (
    request: NextRequest,
    segmentData: SegmentData<P>
  ): Promise<NextResponse> => {
    const { error, user } = await requireAdmin();
    if (error) return error;

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

      return await handler(request, {
        admin: { adminId: user!.id },
        params,
        body,
        query,
      });
    } catch (error) {
      logServerError("admin-route-handler", error, {
        userId: user!.id,
        route: options?.route ?? new URL(request.url).pathname,
      });
      return internalError();
    }
  };
}

function extractClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Wrap a public (unauthenticated) route handler with IP-based rate limiting.
 * Extracts client IP, enforces the rate limit, parses query params, and catches errors.
 *
 * Usage:
 *   export const GET = anonRoute(async (request, { anon, query }) => {
 *     // anon.ip is the client IP
 *     // query is typed from the schema
 *   }, { rateLimit: { action: "discover", limit: 30, windowMs: 60_000 }, query: discoverQuery });
 */
export function anonRoute<
  P extends Record<string, string> = Record<string, never>,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { anon: AnonContext; params: P; query: Q }
  ) => Promise<NextResponse>,
  options: RouteOptions & { rateLimit: RateLimitConfig; query?: z.ZodType<Q> }
) {
  return async (
    request: NextRequest,
    segmentData: SegmentData<P>
  ): Promise<NextResponse> => {
    const ip = extractClientIp(request);

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

    try {
      const params = segmentData?.params
        ? await segmentData.params
        : ({} as P);

      let query: Q = undefined as Q;
      if (options?.query) {
        const parsed = parseQueryParams(
          request.nextUrl.searchParams,
          options.query,
        );
        if (parsed.error) return parsed.error;
        query = parsed.data;
      }

      return await handler(request, { anon: { ip }, params, query });
    } catch (error) {
      logServerError("anon-route-handler", error, {
        route: options?.route ?? new URL(request.url).pathname,
      });
      return internalError();
    }
  };
}

/**
 * Wrap a cron/webhook route handler. Validates CRON_SECRET bearer token,
 * catches unhandled errors, and logs them with route context.
 *
 * Usage:
 *   export const POST = cronRoute(async () => {
 *     const result = await doScheduledWork();
 *     return NextResponse.json(result);
 *   });
 */
export function cronRoute(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options?: RouteOptions
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    try {
      return await handler(request);
    } catch (error) {
      logServerError("cron-route-handler", error, {
        route: options?.route ?? new URL(request.url).pathname,
      });
      return internalError();
    }
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
