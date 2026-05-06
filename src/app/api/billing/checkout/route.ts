import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STRIPE_PRICES } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/billing";
import { logServerError } from "@/lib/error-logger";
import { logger } from "@/lib/logger";
import getStripe from "@/lib/stripe";

const VALID_TIERS = ["starter", "pro", "studio"] as const;
type PaidTier = (typeof VALID_TIERS)[number];

const PRICE_MAP: Record<PaidTier, () => string> = {
  starter: () => STRIPE_PRICES.starter,
  pro: () => STRIPE_PRICES.pro,
  studio: () => STRIPE_PRICES.studio,
};

// POST /api/billing/checkout
// Body: { tier: "starter" | "pro" | "studio" }
// For new subscribers: returns { url: string } — the Stripe Checkout session URL.
// For existing paid subscribers: performs an inline subscription update (upgrade/downgrade)
//   and returns { url: string } pointing to the billing success page.
export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json();
    const { tier } = body as { tier: unknown };

    if (!tier || !VALID_TIERS.includes(tier as PaidTier)) {
      return NextResponse.json(
        { error: "Invalid tier. Must be one of: starter, pro, studio", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const priceId = PRICE_MAP[tier as PaidTier]();
    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price not configured for tier: ${tier}`, code: "CONFIGURATION_ERROR" },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";

    // Check if the user already has an active paid subscription
    const existingSub = await prisma.subscription.findUnique({
      where: { userId },
      select: { stripeSubscriptionId: true, stripeCustomerId: true, stripePriceId: true, status: true },
    });

    const isActivePaidSub =
      existingSub &&
      !existingSub.stripeSubscriptionId.startsWith("free_") &&
      !existingSub.stripeCustomerId.startsWith("free_") &&
      (existingSub.status === "active" || existingSub.status === "trialing");

    if (isActivePaidSub) {
      // Upgrade/downgrade: update the existing subscription's price inline.
      // Stripe handles proration automatically.
      if (existingSub.stripePriceId === priceId) {
        return NextResponse.json(
          { error: "Already subscribed to this plan", code: "SAME_PLAN" },
          { status: 400 }
        );
      }

      const stripe = getStripe();
      const stripeSub = await stripe.subscriptions.retrieve(existingSub.stripeSubscriptionId);
      const itemId = stripeSub.items.data[0]?.id;

      if (!itemId) {
        return NextResponse.json(
          { error: "Could not find subscription item to update", code: "SUBSCRIPTION_ERROR" },
          { status: 500 }
        );
      }

      await stripe.subscriptions.update(existingSub.stripeSubscriptionId, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { userId },
      });

      logger.info({ userId, newPriceId: priceId, subscriptionId: existingSub.stripeSubscriptionId }, "billing-checkout: plan changed inline");

      // The customer.subscription.updated webhook will sync the DB.
      // Return the billing success URL so the client redirects.
      return NextResponse.json({ url: `${appUrl}/settings/billing?success=1` });
    }

    // New subscription: create a Stripe Checkout session.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user?.email) {
      return NextResponse.json(
        { error: "User email not found", code: "USER_ERROR" },
        { status: 400 }
      );
    }

    const customerId = await getOrCreateStripeCustomer(userId, user.email, user.name);

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/settings/billing?success=1`,
      cancel_url: `${appUrl}/settings/billing?cancelled=1`,
      metadata: { userId },
      subscription_data: {
        metadata: { userId },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logServerError("billing-checkout-post", error, {
      route: "/api/billing/checkout",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
