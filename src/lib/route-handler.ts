import { NextRequest, NextResponse } from "next/server";
import {
  runRoutePipeline,
  type RouteOptions,
  type RoutePipelineOptions,
  type RouteSchemas,
  type SegmentData,
} from "@/lib/route-pipeline";
import {
  adminPreflight,
  anonPreflight,
  authPreflight,
  optionalAuthPreflight,
} from "@/lib/route-handler/preflight";
import type {
  AdminContext,
  AnonContext,
  AuthContext,
  OptionalAuthContext,
  PipelineCtx,
  RateLimitConfig,
} from "@/lib/route-handler/types";

export { requireOwned, resultResponse } from "@/lib/route-response";
export type {
  AdminContext,
  AnonContext,
  AuthContext,
  OptionalAuthContext,
  RateLimitConfig,
} from "@/lib/route-handler/types";

type RouteDescriptor<
  P extends Record<string, string>,
  B,
  Q,
  TContext,
  THandlerContext,
> = {
  preflight: (request: NextRequest) => Promise<PreflightResult<TContext>>;
  toHandlerContext: (
    context: TContext,
    parsed: PipelineCtx<P, B, Q>,
  ) => THandlerContext;
  logLabel: string;
  getLogContext: (context: TContext) => Record<string, unknown>;
};

type ParsedRouteContext<P extends Record<string, string>, B, Q> = {
  params: P;
  body: B;
  query: Q;
};

type RouteContextWithKey<
  K extends "auth" | "admin" | "anon",
  TContext,
  P extends Record<string, string>,
  B,
  Q,
> = Record<K, TContext> & ParsedRouteContext<P, B, Q>;

type PreflightResult<TContext> =
  | { ok: true; context: TContext }
  | { ok: false; error: Response };

function withParsedContext<P extends Record<string, string>, B, Q>(
  parsed: PipelineCtx<P, B, Q>,
): ParsedRouteContext<P, B, Q> {
  return {
    params: parsed.params,
    body: parsed.body,
    query: parsed.query,
  };
}

function withKeyedParsedContext<
  K extends "auth" | "admin" | "anon",
  TAuthContext,
  P extends Record<string, string>,
  B,
  Q,
>(
  key: K,
  authContext: TAuthContext,
  parsed: PipelineCtx<P, B, Q>,
): Record<K, TAuthContext> & ParsedRouteContext<P, B, Q> {
  return {
    [key]: authContext,
    ...withParsedContext(parsed),
  } as Record<K, TAuthContext> & ParsedRouteContext<P, B, Q>;
}

function createRouteDescriptor<
  P extends Record<string, string>,
  B,
  Q,
  TContext,
  THandlerContext,
>(
  preflight: (request: NextRequest) => Promise<PreflightResult<TContext>>,
  toHandlerContext: (
    context: TContext,
    parsed: PipelineCtx<P, B, Q>,
  ) => THandlerContext,
  logLabel: string,
  getLogContext: (context: TContext) => Record<string, unknown>,
): RouteDescriptor<P, B, Q, TContext, THandlerContext> {
  return { preflight, toHandlerContext, logLabel, getLogContext };
}

function createPreflightRoute<
  P extends Record<string, string>,
  B,
  Q,
  TContext,
  THandlerContext,
>(
  descriptor: RouteDescriptor<P, B, Q, TContext, THandlerContext>,
  handler: (
    request: NextRequest,
    ctx: THandlerContext,
  ) => Promise<Response>,
  options?: RoutePipelineOptions<B, Q>,
) {
  return async (
    request: NextRequest,
    segmentData: SegmentData<P>,
  ): Promise<Response> => {
    const preflightResult = await descriptor.preflight(request);
    if (!preflightResult.ok) {
      return preflightResult.error;
    }

    return runRoutePipeline(
      request,
      segmentData,
      options,
      descriptor.logLabel,
      descriptor.getLogContext(preflightResult.context),
      (parsed) =>
        handler(request, descriptor.toHandlerContext(preflightResult.context, parsed)),
    );
  };
}

function createPreflightRequestRoute<TContext>(
  descriptor: {
    preflight: (request: NextRequest) => Promise<PreflightResult<TContext>>;
    logLabel: string;
    getLogContext: (context: TContext) => Record<string, unknown>;
  },
  handler: (request: NextRequest, context: TContext) => Promise<Response>,
  options?: RouteOptions,
) {
  return async (request: NextRequest): Promise<Response> => {
    const preflightResult = await descriptor.preflight(request);
    if (!preflightResult.ok) {
      return preflightResult.error;
    }

    return runRoutePipeline(
      request,
      undefined,
      options,
      descriptor.logLabel,
      descriptor.getLogContext(preflightResult.context),
      () => handler(request, preflightResult.context),
    );
  };
}

function createKeyedRoute<
  K extends "auth" | "admin" | "anon",
  TContext,
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
  Q = undefined,
>(
  key: K,
  preflight: (request: NextRequest) => Promise<PreflightResult<TContext>>,
  logLabel: string,
  getLogContext: (context: TContext) => Record<string, unknown>,
  handler: (
    request: NextRequest,
    ctx: RouteContextWithKey<K, TContext, P, B, Q>,
  ) => Promise<Response>,
  options?: RoutePipelineOptions<B, Q>,
) {
  return createPreflightRoute<P, B, Q, TContext, RouteContextWithKey<K, TContext, P, B, Q>>(
    createRouteDescriptor(
    preflight,
      (context, parsed) => withKeyedParsedContext(key, context, parsed),
      logLabel,
      getLogContext,
    ),
    handler,
    options,
  );
}

export function authRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { auth: AuthContext; params: P; body: B; query: Q },
  ) => Promise<Response>,
  options?: RoutePipelineOptions<B, Q>,
) {
  return createKeyedRoute<"auth", AuthContext, P, B, Q>(
    "auth",
    authPreflight,
    "route-handler",
    (auth) => ({ userId: auth.userId }),
    handler,
    options,
  );
}

export function optionalAuthRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { auth: OptionalAuthContext; params: P; body: B; query: Q },
  ) => Promise<Response>,
  options?: RoutePipelineOptions<B, Q>,
) {
  return createKeyedRoute<"auth", OptionalAuthContext, P, B, Q>(
    "auth",
    optionalAuthPreflight,
    "optional-auth-route-handler",
    (auth) => ({ userId: auth.userId }),
    handler,
    options,
  );
}

export function publicRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { params: P; body: B; query: Q },
  ) => Promise<Response>,
  options?: RoutePipelineOptions<B, Q>,
) {
  return createPreflightRoute<P, B, Q, null, ParsedRouteContext<P, B, Q>>(
    createRouteDescriptor(
      async () => ({ ok: true, context: null }),
      (_unused, parsed) => withParsedContext(parsed),
      "public-route-handler",
      () => ({}),
    ),
    handler,
    options,
  );
}

export function adminRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { admin: AdminContext; params: P; body: B; query: Q },
  ) => Promise<Response>,
  options?: RoutePipelineOptions<B, Q>,
) {
  return createKeyedRoute<"admin", AdminContext, P, B, Q>(
    "admin",
    async () => adminPreflight(),
    "admin-route-handler",
    (admin) => ({ userId: admin.adminId }),
    handler,
    options,
  );
}

export function anonRoute<
  P extends Record<string, string> = Record<string, never>,
  Q = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { anon: AnonContext; params: P; query: Q },
  ) => Promise<Response>,
  options: RouteOptions & RouteSchemas<never, Q> & { rateLimit: RateLimitConfig },
) {
  return createKeyedRoute<"anon", AnonContext, P, never, Q>(
    "anon",
    async (request) => anonPreflight(request, options.rateLimit),
    "anon-route-handler",
    () => ({}),
    handler,
    options,
  );
}

export function cronRoute(
  handler: (request: NextRequest) => Promise<Response>,
  options?: RouteOptions,
) {
  return createPreflightRequestRoute(
    {
      preflight: async (request) => {
        const authHeader = request.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
          return {
            ok: false,
            error: NextResponse.json(
              { error: "Unauthorized", code: "UNAUTHORIZED" },
              { status: 401 },
            ),
          };
        }

        return { ok: true, context: null };
      },
      logLabel: "cron-route-handler",
      getLogContext: () => ({}),
    },
    async (request) => handler(request),
    options,
  );
}
