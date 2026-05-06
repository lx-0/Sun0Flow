import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import getStripe from "@/lib/stripe";

// POST /api/billing/portal
// Creates a Stripe Customer Portal session for the authenticated user.
// Returns: { url: string }
export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });

    if (!subscription || subscription.stripeCustomerId.startsWith("free_")) {
      return NextResponse.json(
        { error: "No active paid subscription found", code: "NO_SUBSCRIPTION" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/settings/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    logServerError("billing-portal-post", error, {
      route: "/api/billing/portal",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
