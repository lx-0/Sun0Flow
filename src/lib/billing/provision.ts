import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

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

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  name?: string | null
): Promise<string> {
  const getStripe = (await import("@/lib/stripe")).default;
  const stripe = getStripe();

  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (sub && !sub.stripeCustomerId.startsWith("free_")) {
    return sub.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: { userId },
  });

  logger.info({ userId, customerId: customer.id }, "billing: Stripe customer created");
  return customer.id;
}
