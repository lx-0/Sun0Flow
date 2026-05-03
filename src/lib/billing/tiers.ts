import { SubscriptionTier } from "@prisma/client";

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

export function tierFromPriceId(priceId: string): SubscriptionTier {
  const { STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_STUDIO } =
    process.env;
  if (priceId === STRIPE_PRICE_STARTER) return "starter";
  if (priceId === STRIPE_PRICE_PRO) return "pro";
  if (priceId === STRIPE_PRICE_STUDIO) return "studio";
  return "free";
}
