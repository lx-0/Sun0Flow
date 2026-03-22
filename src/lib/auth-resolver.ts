import { auth } from "@/lib/auth";
import { resolveApiKeyUser } from "@/lib/api-key-auth";
import { NextResponse } from "next/server";

export type AuthResult =
  | { userId: string; isApiKey: boolean; error: null }
  | { userId: null; isApiKey: false; error: NextResponse };

/**
 * Resolve the authenticated user from session or API key.
 *
 * Priority: session auth first, then API key auth.
 * API key auth never grants admin access — use requireAdmin() for admin routes.
 */
export async function resolveUser(request: Request): Promise<AuthResult> {
  // 1. Try session auth
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, isApiKey: false, error: null };
  }

  // 2. Try API key auth
  const userId = await resolveApiKeyUser(request);
  if (userId) {
    return { userId, isApiKey: true, error: null };
  }

  return {
    userId: null,
    isApiKey: false,
    error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}
