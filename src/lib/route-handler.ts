import { NextRequest, NextResponse } from "next/server";
import {
  runRoutePipeline,
  type RouteOptions,
  type RoutePipelineOptions,
  type RouteSchemas,
} from "@/lib/route-pipeline";
import { createRouteWrapper } from "@/lib/route-handler/wrapper";
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
  PreflightResult,
  RateLimitConfig,
} from "@/lib/route-handler/types";
import type { PipelineCtx } from "@/lib/route-handler/types";

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
  toHandlerContext: (context: TContext, parsed: PipelineCtx<P, B, Q>) => THandlerContext;
  logLabel: string;
  getLogContext: (context: TContext) => Record<string, unknown>;
};

type ParsedRouteContext<P extends Record<string, string>, B, Q> = {
  params: P;
  body: B;
  query: Q;
};

type RouteContextWithAuth<
  TAuthContext,
  P extends Record<string, string>,
  B,
  Q,
> = { auth: TAuthContext } & ParsedRouteContext<P, B, Q>;

function withParsedContext<P extends Record<string, string>, B, Q>(
  parsed: PipelineCtx<P, B, Q>,
): ParsedRouteContext<P, B, Q> {
  return {
    params: parsed.params,
    body: parsed.body,
    query: parsed.query,
  };
}

function withAuthParsedContext<
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
  toHandlerContext: (context: TContext, parsed: PipelineCtx<P, B, Q>) => THandlerContext,
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
  return createRouteWrapper<P, B, Q, TContext>(
    descriptor.preflight,
    (request, context, parsed) =>
      handler(request, descriptor.toHandlerContext(context, parsed)),
    options,
    descriptor.logLabel,
    descriptor.getLogContext,
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
  return createPreflightRoute<P, B, Q, AuthContext, RouteContextWithAuth<AuthContext, P, B, Q>>(
    createRouteDescriptor(
      authPreflight,
      (auth, parsed) => withAuthParsedContext("auth", auth, parsed),
      "route-handler",
      (auth) => ({ userId: auth.userId }),
    ),
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
  return createPreflightRoute<
    P,
    B,
    Q,
    OptionalAuthContext,
    RouteContextWithAuth<OptionalAuthContext, P, B, Q>
  >(
    createRouteDescriptor(
      optionalAuthPreflight,
      (auth, parsed) => withAuthParsedContext("auth", auth, parsed),
      "optional-auth-route-handler",
      (auth) => ({ userId: auth.userId }),
    ),
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
  return createPreflightRoute<P, B, Q, AdminContext, { admin: AdminContext } & ParsedRouteContext<P, B, Q>>(
    createRouteDescriptor(
      async () => adminPreflight(),
      (admin, parsed) => withAuthParsedContext("admin", admin, parsed),
      "admin-route-handler",
      (admin) => ({ userId: admin.adminId }),
    ),
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
  return createPreflightRoute<
    P,
    never,
    Q,
    AnonContext,
    { anon: AnonContext } & ParsedRouteContext<P, never, Q>
  >(
    createRouteDescriptor(
      async (request) => anonPreflight(request, options.rateLimit),
      (anon, parsed) => withAuthParsedContext("anon", anon, parsed),
      "anon-route-handler",
      () => ({}),
    ),
    handler,
    options,
  );
}

export function cronRoute(
  handler: (request: NextRequest) => Promise<Response>,
  options?: RouteOptions,
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

    return runRoutePipeline(request, undefined, options, "cron-route-handler", {}, () =>
      handler(request),
    );
  };
}
