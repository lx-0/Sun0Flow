import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Song } from "@prisma/client";
import { resolveUser, requireAdmin } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { badRequest, notFound, internalError } from "@/lib/api-error";

export type AuthContext = {
  userId: string;
  isApiKey: boolean;
  isAdmin: boolean;
};

export type AdminContext = {
  adminId: string;
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
 */
export function authRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { auth: AuthContext; params: P; body: B }
  ) => Promise<NextResponse>,
  options?: RouteOptions & { body?: z.ZodType<B> }
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

      return await handler(request, {
        auth: {
          userId: result.userId,
          isApiKey: result.isApiKey,
          isAdmin: result.isAdmin,
        },
        params,
        body,
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
 * Wrap a route handler that operates on a song. Resolves auth, finds the song
 * by params.id with the specified access mode, and returns 404 if not found.
 *
 * Access modes:
 *   "owned"      — song must belong to the authenticated user (default)
 *   "accessible" — song must be owned by user OR public
 *
 * Usage:
 *   export const POST = songRoute(async (request, { auth, song }) => { ... });
 *   export const GET = songRoute(async (request, { auth, song }) => { ... }, { access: "accessible" });
 */
export function songRoute<B = undefined>(
  handler: (
    request: NextRequest,
    ctx: { auth: AuthContext; song: Song; params: { id: string }; body: B }
  ) => Promise<NextResponse>,
  options?: RouteOptions & { body?: z.ZodType<B>; access?: "owned" | "accessible" }
) {
  const access = options?.access ?? "owned";

  return async (
    request: NextRequest,
    segmentData: SegmentData<{ id: string }>
  ): Promise<NextResponse> => {
    const result = await resolveUser(request);
    if (result.error) return result.error;

    try {
      const params = segmentData?.params
        ? await segmentData.params
        : ({ id: "" } as { id: string });

      const where =
        access === "accessible"
          ? { id: params.id, OR: [{ userId: result.userId }, { isPublic: true }] }
          : { id: params.id, userId: result.userId };

      const song = await prisma.song.findFirst({ where });
      if (!song) return notFound();

      let body: B = undefined as B;
      if (options?.body) {
        const parsed = await parseBody(request, options.body);
        if (parsed.error) return parsed.error;
        body = parsed.data;
      }

      return await handler(request, {
        auth: {
          userId: result.userId,
          isApiKey: result.isApiKey,
          isAdmin: result.isAdmin,
        },
        song,
        params,
        body,
      });
    } catch (error) {
      logServerError("song-route-handler", error, {
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
 */
export function adminRoute<
  P extends Record<string, string> = Record<string, never>,
  B = undefined,
>(
  handler: (
    request: NextRequest,
    ctx: { admin: AdminContext; params: P; body: B }
  ) => Promise<NextResponse>,
  options?: RouteOptions & { body?: z.ZodType<B> }
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

      return await handler(request, {
        admin: { adminId: user!.id },
        params,
        body,
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
