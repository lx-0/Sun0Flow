import Stripe from "stripe";
import getStripe from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications";
import { tierFromPriceId, TIER_LIMITS } from "./tiers";
import { stripeStatusToPrisma } from "./resolve-user";

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;

  if (session.mode === "payment" && session.metadata?.topupCredits) {
    await handleTopupCheckoutCompleted(session, userId);
    return;
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!customerId || !subscriptionId || !userId) {
    logger.warn(
      { customerId, subscriptionId, userId },
      "billing-webhook: checkout.session.completed missing required fields"
    );
    return;
  }

  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
  const item = stripeSub.items.data[0];
  const priceId = item?.price?.id ?? "";
  const tier = tierFromPriceId(priceId);
  const limits = TIER_LIMITS[tier];

  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : new Date();
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      tier,
      status: stripeStatusToPrisma(stripeSub.status),
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    },
    update: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      tier,
      status: stripeStatusToPrisma(stripeSub.status),
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    },
  });

  logger.info(
    { userId, tier, creditsPerMonth: limits.creditsPerMonth },
    "billing-webhook: subscription provisioned via checkout"
  );
}

async function handleTopupCheckoutCompleted(
  session: Stripe.Checkout.Session,
  userId: string | undefined
) {
  if (!userId) {
    logger.warn({ sessionId: session.id }, "billing-webhook: topup checkout missing userId in metadata");
    return;
  }

  const credits = parseInt(session.metadata?.topupCredits ?? "0", 10);
  if (!credits || credits <= 0) {
    logger.warn({ sessionId: session.id, credits }, "billing-webhook: topup checkout invalid credits value");
    return;
  }

  const amountCents = session.amount_total ?? 0;
  const currency = session.currency ?? "usd";
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const existing = await prisma.creditTopUp.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing) {
    logger.info({ sessionId: session.id }, "billing-webhook: topup already recorded, skipping");
    return;
  }

  await prisma.creditTopUp.create({
    data: {
      userId,
      credits,
      amountCents,
      currency,
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      expiresAt,
    },
  });

  await createNotification({
    userId,
    type: "credit_update",
    title: "Credits added",
    message: `${credits} credits have been added to your account and are ready to use.`,
    href: "/settings/billing",
  });

  logger.info(
    { userId, credits, amountCents, sessionId: session.id },
    "billing-webhook: top-up credits added"
  );
}
