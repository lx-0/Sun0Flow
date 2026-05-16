import { NextRequest, NextResponse } from "next/server";
import {
  runRoutePipeline,
  type RouteOptions,
  type RoutePipelineOptions,
  type RouteSchemas,
} from "@/lib/route-pipeline";
import { createRouteWrapper } from "@/lib/route-handler/wrapper";
import {
  createRouteDescriptor,
  type ParsedRouteContext,
  type RouteDescriptor,
  withAuthParsedContext,
  withParsedContext,
} from "@/lib/route-handler/descriptor";
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

export { requireOwned, resultResponse } from "@/lib/route-response";
export type {
  AdminContext,
  AnonContext,
  AuthContext,
  OptionalAuthContext,
  RateLimitConfig,
} from "@/lib/route-handler/types";

type RouteFactoryConfig<TContext, TPreflightContext = TContext> = {
  preflight: (request: NextRequest) => Promise<PreflightResult<TPreflightContext>>;
  mapContext: (context: TPreflightContext) => TContext;
  logLabel: string;
  getLogContext: (context: TContext) => Record<string, unknown>;
};

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

function createContextRouteFactory<
  TContext,
  THandlerKey extends "auth" | "admin" | "anon",
>(
  key: THandlerKey,
  config: RouteFactoryConfig<TContext>,
) {
  return function routeFactory<
    P extends Record<string, string> = Record<string, never>,
    B = undefined,
    Q = undefined,
  >(
    handler: (
      request: NextRequest,
      ctx: Record<THandlerKey, TContext> & ParsedRouteContext<P, B, Q>,
    ) => Promise<Response>,
    options?: RoutePipelineOptions<B, Q>,
  ) {
    return createPreflightRoute<
      P,
      B,
      Q,
      TContext,
      Record<THandlerKey, TContext> & ParsedRouteContext<P, B, Q>
    >(
      createRouteDescriptor(
        async (request) => {
          const result = await config.preflight(request);
          if (!result.ok) return result;
          return { ok: true as const, context: config.mapContext(result.context) };
        },
        (context, parsed) => withAuthParsedContext(key, context, parsed),
        config.logLabel,
        config.getLogContext,
      ),
      handler,
      options,
    );
  };
}

const authLikeRoute = createContextRouteFactory("auth", {
  preflight: authPreflight,
  mapContext: (context) => context,
  logLabel: "route-handler",
  getLogContext: (auth) => ({ userId: auth.userId }),
});

const optionalAuthLikeRoute = createContextRouteFactory("auth", {
  preflight: optionalAuthPreflight,
  mapContext: (context) => context,
  logLabel: "optional-auth-route-handler",
  getLogContext: (auth) => ({ userId: auth.userId }),
});

const adminLikeRoute = createContextRouteFactory("admin", {
  preflight: async () => adminPreflight(),
  mapContext: (context) => context,
  logLabel: "admin-route-handler",
  getLogContext: (admin) => ({ userId: admin.adminId }),
});
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
  return authLikeRoute<P, B, Q>(handler, options);
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
  return optionalAuthLikeRoute<P, B, Q>(handler, options);
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
  return adminLikeRoute<P, B, Q>(handler, options);
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
