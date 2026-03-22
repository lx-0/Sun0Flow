import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/api-keys";

/**
 * Resolve a user from an API key in the Authorization header.
 * Returns the userId if valid, or null if the key is missing/invalid/revoked.
 * Updates lastUsedAt on successful auth (fire-and-forget).
 */
export async function resolveApiKeyUser(
  request: Request
): Promise<string | null> {
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

  // Update lastUsedAt fire-and-forget — don't block the request
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return apiKey.userId;
}
