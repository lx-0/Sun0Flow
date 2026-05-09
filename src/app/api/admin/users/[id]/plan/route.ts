import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubscriptionTier } from "@prisma/client";

const VALID_TIERS: SubscriptionTier[] = ["free", "starter", "pro", "studio"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const tier = body?.tier as SubscriptionTier | undefined;

  if (!tier || !VALID_TIERS.includes(tier)) {
    return NextResponse.json(
      { error: `tier must be one of: ${VALID_TIERS.join(", ")}`, code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, subscription: { select: { id: true, tier: true } } },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const previousTier = user.subscription?.tier ?? "free";

  if (tier === "free") {
    // Remove subscription if downgrading to free
    if (user.subscription) {
      await prisma.subscription.update({
        where: { userId: id },
        data: { tier: "free", status: "canceled" },
      });
    }
  } else {
    // Upsert subscription with admin-set tier
    await prisma.subscription.upsert({
      where: { userId: id },
      create: {
        userId: id,
        stripeCustomerId: `admin_${id}`,
        stripeSubscriptionId: `admin_sub_${id}_${Date.now()}`,
        stripePriceId: `admin_${tier}`,
        tier,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        tier,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  await logAdminAction(
    admin!.id,
    "change_plan",
    id,
    `User ${user.email} plan changed from ${previousTier} to ${tier}`
  );

  return NextResponse.json({ ok: true, tier });
}
