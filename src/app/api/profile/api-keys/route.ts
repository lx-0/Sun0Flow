import { NextResponse } from "next/server";
import { z } from "zod";
import { generateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authRoute } from "@/lib/route-handler";
import { canUseFeature, SubscriptionTier } from "@/lib/feature-gates";
import { badRequest, forbidden } from "@/lib/api-error";

const MAX_ACTIVE_KEYS = 5;

export const GET = authRoute(async (_request, { auth }) => {
  const keys = await prisma.apiKey.findMany({
    where: { userId: auth.userId, revokedAt: null },
    select: {
      id: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ keys });
});

const createKeyBody = z.object({
  name: z.string().trim().min(1, "Name is required").max(64, "Name must be 64 characters or less"),
});

export const POST = authRoute(
  async (_request, { auth, body }) => {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: auth.userId },
      select: { tier: true },
    });
    const tier: SubscriptionTier = subscription?.tier ?? "free";
    if (!canUseFeature("apiKeys", tier)) {
      return forbidden("Studio tier required");
    }

    const activeCount = await prisma.apiKey.count({
      where: { userId: auth.userId, revokedAt: null },
    });
    if (activeCount >= MAX_ACTIVE_KEYS) {
      return badRequest(`Maximum of ${MAX_ACTIVE_KEYS} active API keys allowed`);
    }

    const { key, hash, prefix } = generateApiKey();

    const created = await prisma.apiKey.create({
      data: {
        userId: auth.userId,
        name: body.name,
        keyHash: hash,
        prefix,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ...created, key }, { status: 201 });
  },
  { body: createKeyBody },
);
