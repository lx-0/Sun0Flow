import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { tierFromPriceId } from "./tiers";
import { stripeStatusToPrisma, userIdFromSubscriptionId } from "./resolve-user";

export async function handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
  const item = stripeSub.items.data[0];
  const priceId = item?.price?.id ?? "";
  const tier = tierFromPriceId(priceId);

  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : new Date();
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: stripeSub.id },
    data: {
      tier,
      status: stripeStatusToPrisma(stripeSub.status),
      stripePriceId: priceId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
      trialStart: stripeSub.trial_start ? new Date(stripeSub.trial_start * 1000) : null,
      trialEnd: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
    },
  });

  logger.info({ subscriptionId: stripeSub.id, tier, status: stripeSub.status }, "billing-webhook: subscription updated");
}

export async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription) {
  const userId = await userIdFromSubscriptionId(stripeSub.id);
  if (!userId) {
    logger.warn({ subscriptionId: stripeSub.id }, "billing-webhook: no user for deleted subscription");
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: stripeSub.id },
    data: {
      tier: "free",
      status: "canceled",
      canceledAt: now,
      stripeSubscriptionId: `free_sub_${userId}`,
      stripePriceId: "free",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  logger.info({ userId, subscriptionId: stripeSub.id }, "billing-webhook: subscription deleted — downgraded to FREE");
}
