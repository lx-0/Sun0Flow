import { auth } from "@/lib/auth";
import { hashApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api-error";

export type AuthResult =
  | { userId: string; isApiKey: boolean; isAdmin: boolean; error: null }
  | { userId: null; isApiKey: false; isAdmin: false; error: NextResponse };

async function resolveApiKeyUser(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(sk-.+)$/);
  if (!match) return null;

  const rawKey = match[1];
  const keyHash = hashApiKey(rawKey);

  const apiKey = await prisma.apiKey.findFirst({
    where: { keyHash, revokedAt: null },
    select: { id: true, userId: true },
  });

  if (!apiKey) return null;

  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return apiKey.userId;
}

export async function resolveUser(request: Request): Promise<AuthResult> {
  const session = await auth();
  if (session?.user?.id) {
    return {
      userId: session.user.id,
      isApiKey: false,
      isAdmin: Boolean((session.user as Record<string, unknown>).isAdmin),
      error: null,
    };
  }

  const userId = await resolveApiKeyUser(request);
  if (userId) {
    return { userId, isApiKey: true, isAdmin: false, error: null };
  }

  return {
    userId: null,
    isApiKey: false,
    isAdmin: false,
    error: unauthorized(),
  };
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null, user: null };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isAdmin: true },
  });

  if (!user?.isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null, user: null };
  }

  return { error: null, session, user };
}

export async function logAdminAction(adminId: string, action: string, targetId?: string, details?: string) {
  await prisma.adminLog.create({
    data: { adminId, action, targetId, details },
  });
}
