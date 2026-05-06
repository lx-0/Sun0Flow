import { NextResponse } from "next/server";
import { auth, generateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { canUseFeature, SubscriptionTier } from "@/lib/feature-gates";

const MAX_ACTIVE_KEYS = 5;

/** List active API keys (never returns full key). */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const keys = await prisma.apiKey.findMany({
      where: { userId: session.user.id, revokedAt: null },
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
  } catch (error) {
    logServerError("api-keys", error, { route: "GET /api/profile/api-keys" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

/** Create a new API key. Returns the full key exactly once. */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    // Server-side tier check: API keys require Studio tier
    const subscription = await prisma.subscription.findUnique({
      where: { userId: session.user.id },
      select: { tier: true },
    });
    const tier: SubscriptionTier = subscription?.tier ?? "free";
    if (!canUseFeature("apiKeys", tier)) {
      return NextResponse.json(
        { error: "Studio tier required", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Name is required", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (name.length > 64) {
      return NextResponse.json({ error: "Name must be 64 characters or less", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    // Enforce max active keys
    const activeCount = await prisma.apiKey.count({
      where: { userId: session.user.id, revokedAt: null },
    });
    if (activeCount >= MAX_ACTIVE_KEYS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_ACTIVE_KEYS} active API keys allowed`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const { key, hash, prefix } = generateApiKey();

    const created = await prisma.apiKey.create({
      data: {
        userId: session.user.id,
        name,
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
  } catch (error) {
    logServerError("api-keys", error, { route: "POST /api/profile/api-keys" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
