import { prisma } from "@/lib/prisma";

/**
 * Resolve the Suno API key for a user.
 * Returns the user's personal key if set, otherwise undefined (caller falls back to env var).
 */
export async function resolveUserApiKey(userId: string): Promise<string | undefined> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sunoApiKey: true },
  });
  return user?.sunoApiKey ?? undefined;
}

/**
 * Returns the user's personal API key and whether personal key mode is active.
 * Personal key mode is active when usePersonalApiKey=true and a key is stored.
 */
export async function resolveUserApiKeyWithMode(userId: string): Promise<{
  apiKey: string | undefined;
  usingPersonalKey: boolean;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sunoApiKey: true, usePersonalApiKey: true },
  });
  const apiKey = user?.sunoApiKey ?? undefined;
  const usingPersonalKey = Boolean(user?.usePersonalApiKey && apiKey);
  return { apiKey, usingPersonalKey };
}
