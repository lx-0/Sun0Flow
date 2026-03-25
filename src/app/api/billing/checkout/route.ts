import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { STRIPE_PRICES } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/billing";
import { logServerError } from "@/lib/error-logger";
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
// Returns: { url: string } — the Stripe Checkout session URL.
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
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";

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
