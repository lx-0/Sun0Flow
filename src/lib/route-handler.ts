import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { requireAdmin } from "@/lib/admin-auth";
import { logServerError } from "@/lib/error-logger";
import { internalError } from "@/lib/api-error";

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

/**
 * Wrap an authenticated route handler. Resolves auth, catches unhandled errors,
 * and logs them with request context.
 *
 * Usage (no dynamic params):
 *   export const GET = authRoute(async (request, { auth }) => { ... });
 *
 * Usage (with dynamic params):
 *   export const GET = authRoute<{ id: string }>(async (request, { auth, params }) => { ... });
 */
export function authRoute<P extends Record<string, string> = Record<string, never>>(
  handler: (
    request: NextRequest,
    ctx: { auth: AuthContext; params: P }
  ) => Promise<NextResponse>,
  options?: RouteOptions
) {
  return async (
    request: NextRequest,
    segmentData?: SegmentData<P>
  ): Promise<NextResponse> => {
    const result = await resolveUser(request);
    if (result.error) return result.error;

    try {
      const params = segmentData
        ? await segmentData.params
        : ({} as P);
      return await handler(request, {
        auth: {
          userId: result.userId,
          isApiKey: result.isApiKey,
          isAdmin: result.isAdmin,
        },
        params,
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
 */
export function adminRoute<P extends Record<string, string> = Record<string, never>>(
  handler: (
    request: NextRequest,
    ctx: { admin: AdminContext; params: P }
  ) => Promise<NextResponse>,
  options?: RouteOptions
) {
  return async (
    request: NextRequest,
    segmentData?: SegmentData<P>
  ): Promise<NextResponse> => {
    const { error, user } = await requireAdmin();
    if (error) return error;

    try {
      const params = segmentData
        ? await segmentData.params
        : ({} as P);
      return await handler(request, {
        admin: { adminId: user!.id },
        params,
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
