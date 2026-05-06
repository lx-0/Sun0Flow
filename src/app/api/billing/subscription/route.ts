import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TIER_LIMITS } from "@/lib/billing";
import { logServerError } from "@/lib/error-logger";

// GET /api/billing/subscription
// Returns the current user's subscription tier, status, credits, and period dates.
export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      // No subscription yet — return default FREE limits without a DB record
      const limits = TIER_LIMITS.free;
      return NextResponse.json({
        tier: "free",
        status: "active",
        creditsPerMonth: limits.creditsPerMonth,
        generationsPerHour: limits.generationsPerHour,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    }

    const limits = TIER_LIMITS[subscription.tier];

    return NextResponse.json({
      tier: subscription.tier,
      status: subscription.status,
      creditsPerMonth: limits.creditsPerMonth,
      generationsPerHour: limits.generationsPerHour,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialEnd: subscription.trialEnd ?? null,
    });
  } catch (error) {
    logServerError("billing-subscription-get", error, {
      route: "/api/billing/subscription",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
