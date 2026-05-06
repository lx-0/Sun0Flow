import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import getStripe from "@/lib/stripe";

// POST /api/billing/cancel
// Body: { reason?: string }
// Cancels the subscription at the end of the current billing period.
// Returns: { success: true, cancelAtPeriodEnd: true }
export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : undefined;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: {
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        status: true,
        cancelAtPeriodEnd: true,
      },
    });

    if (
      !subscription ||
      subscription.stripeSubscriptionId.startsWith("free_") ||
      subscription.stripeCustomerId.startsWith("free_")
    ) {
      return NextResponse.json(
        { error: "No active paid subscription to cancel", code: "NO_SUBSCRIPTION" },
        { status: 400 }
      );
    }

    if (subscription.cancelAtPeriodEnd) {
      return NextResponse.json(
        { error: "Subscription is already scheduled for cancellation", code: "ALREADY_CANCELLED" },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
      metadata: reason ? { cancellation_reason: reason } : undefined,
    });

    // Optimistically update the DB; the webhook will confirm
    await prisma.subscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: true },
    });

    return NextResponse.json({ success: true, cancelAtPeriodEnd: true });
  } catch (error) {
    logServerError("billing-cancel-post", error, {
      route: "/api/billing/cancel",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
