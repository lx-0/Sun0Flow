import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateStripeCustomer } from "@/lib/billing";
import { logServerError } from "@/lib/error-logger";
import getStripe, { STRIPE_TOPUP_PRICES, TOPUP_PACKAGES, type TopupPackageId } from "@/lib/stripe";

const VALID_PACKAGES = TOPUP_PACKAGES.map((p) => p.id);

const PRICE_MAP: Record<TopupPackageId, () => string> = {
  credits_10: () => STRIPE_TOPUP_PRICES.credits_10,
  credits_25: () => STRIPE_TOPUP_PRICES.credits_25,
  credits_50: () => STRIPE_TOPUP_PRICES.credits_50,
};

// POST /api/billing/topup
// Body: { package: "credits_10" | "credits_25" | "credits_50" }
// Returns: { url: string } — the Stripe Checkout session URL.
export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json();
    const { package: pkg } = body as { package: unknown };

    if (!pkg || !VALID_PACKAGES.includes(pkg as TopupPackageId)) {
      return NextResponse.json(
        { error: "Invalid package. Must be one of: credits_10, credits_25, credits_50", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const packageDef = TOPUP_PACKAGES.find((p) => p.id === pkg)!;
    const priceId = PRICE_MAP[pkg as TopupPackageId]();

    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price not configured for package: ${pkg}`, code: "CONFIGURATION_ERROR" },
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
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/settings/billing?topup_success=1`,
      cancel_url: `${appUrl}/settings/billing?topup_cancelled=1`,
      metadata: {
        userId,
        topupPackage: pkg as string,
        topupCredits: String(packageDef.credits),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logServerError("billing-topup-post", error, {
      route: "/api/billing/topup",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// GET /api/billing/topup
// Returns the user's credit top-up purchase history.
export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const topUps = await prisma.creditTopUp.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        credits: true,
        amountCents: true,
        currency: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ topUps });
  } catch (error) {
    logServerError("billing-topup-get", error, {
      route: "/api/billing/topup",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
