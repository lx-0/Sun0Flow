import { NextRequest } from "next/server";
import type { PipelineCtx, PreflightResult } from "@/lib/route-handler/types";

export type RouteDescriptor<
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

export type ParsedRouteContext<P extends Record<string, string>, B, Q> = {
  params: P;
  body: B;
  query: Q;
};

export type RouteContextWithAuth<
  TAuthContext,
  P extends Record<string, string>,
  B,
  Q,
> = { auth: TAuthContext } & ParsedRouteContext<P, B, Q>;

export function withParsedContext<P extends Record<string, string>, B, Q>(
  parsed: PipelineCtx<P, B, Q>,
): ParsedRouteContext<P, B, Q> {
  return {
    params: parsed.params,
    body: parsed.body,
    query: parsed.query,
  };
}

export function withAuthParsedContext<
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

export function createRouteDescriptor<
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
