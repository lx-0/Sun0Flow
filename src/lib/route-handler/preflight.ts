import { NextRequest } from "next/server";
import { resolveUser, requireAdmin } from "@/lib/auth";
import { getClientIp } from "@/lib/network";
import { rateLimited } from "@/lib/api-error";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import type {
  AdminContext,
  AnonContext,
  AuthContext,
  OptionalAuthContext,
  PreflightResult,
  RateLimitConfig,
} from "@/lib/route-handler/types";

export async function authPreflight(
  request: NextRequest,
): Promise<PreflightResult<AuthContext>> {
  const result = await resolveUser(request);
  if (result.error) return { ok: false, error: result.error };

  return {
    ok: true,
    context: {
      userId: result.userId,
      isApiKey: result.isApiKey,
      isAdmin: result.isAdmin,
    },
  };
}

export async function optionalAuthPreflight(
  request: NextRequest,
): Promise<PreflightResult<OptionalAuthContext>> {
  const result = await resolveUser(request);

  return {
    ok: true,
    context: result.error
      ? { userId: null, isApiKey: false, isAdmin: false }
      : {
          userId: result.userId,
          isApiKey: result.isApiKey,
          isAdmin: result.isAdmin,
        },
  };
}

export async function adminPreflight(): Promise<PreflightResult<AdminContext>> {
  const { error, user } = await requireAdmin();
  if (error) return { ok: false, error };

  return { ok: true, context: { adminId: user!.id } };
}

export async function anonPreflight(
  request: NextRequest,
  rateLimit: RateLimitConfig,
): Promise<PreflightResult<AnonContext>> {
  const ip = getClientIp(request);
  const { acquired } = await acquireAnonRateLimitSlot(
    ip,
    rateLimit.action,
    rateLimit.limit,
    rateLimit.windowMs,
  );

  if (!acquired) {
    return {
      ok: false,
      error: rateLimited("Too many requests. Try again later.", undefined, {
        "Retry-After": String(Math.ceil(rateLimit.windowMs / 1000)),
      }),
    };
  }

  return { ok: true, context: { ip } };
}
