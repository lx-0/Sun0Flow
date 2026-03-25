/**
 * Billing helpers — tier limits, subscription provisioning, credit allocations.
 * Server-side only; never import from client components.
 */

import { SubscriptionTier, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Tier limits
// ---------------------------------------------------------------------------

export interface TierLimits {
  creditsPerMonth: number;
  generationsPerHour: number;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: { creditsPerMonth: 200, generationsPerHour: 5 },
  starter: { creditsPerMonth: 1500, generationsPerHour: 25 },
  pro: { creditsPerMonth: 5000, generationsPerHour: 50 },
  studio: { creditsPerMonth: 15000, generationsPerHour: 100 },
};

// ---------------------------------------------------------------------------
// Stripe price → tier mapping (run-time; env vars supply the price IDs)
// ---------------------------------------------------------------------------

export function tierFromPriceId(priceId: string): SubscriptionTier {
  const { STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_STUDIO } =
    process.env;
  if (priceId === STRIPE_PRICE_STARTER) return "starter";
  if (priceId === STRIPE_PRICE_PRO) return "pro";
  if (priceId === STRIPE_PRICE_STUDIO) return "studio";
  return "free";
}

// ---------------------------------------------------------------------------
// Subscription provisioning
// ---------------------------------------------------------------------------

/**
 * Ensure the user has a FREE subscription record.
 * Called on signup — idempotent (upsert by userId).
 */
export async function ensureFreeSubscription(userId: string): Promise<void> {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing) return;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.subscription.create({
    data: {
      userId,
      stripeCustomerId: `free_${userId}`,
      stripeSubscriptionId: `free_sub_${userId}`,
      stripePriceId: "free",
      tier: "free",
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  logger.info({ userId }, "billing: FREE subscription created on signup");
}

/**
 * Get or create a Stripe customer for the user.
 * Returns the Stripe customer ID, persisting it on the Subscription record.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  name?: string | null
): Promise<string> {
  const getStripe = (await import("@/lib/stripe")).default;
  const stripe = getStripe();

  // Check if we already have a non-free customer ID stored
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (sub && !sub.stripeCustomerId.startsWith("free_")) {
    return sub.stripeCustomerId;
  }

  // Create a new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: { userId },
  });

  logger.info({ userId, customerId: customer.id }, "billing: Stripe customer created");
  return customer.id;
}
