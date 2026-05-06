import Stripe from "stripe";
import getStripe from "@/lib/stripe";
import { SubscriptionTier, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications";

// ── Tiers ────────────────────────────────────────────────────────────

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

// ── Resolve user ─────────────────────────────────────────────────────

function stripeStatusToPrisma(status: Stripe.Subscription.Status): SubscriptionStatus {
  const map: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "unpaid",
    incomplete: "incomplete",
    incomplete_expired: "incomplete_expired",
    paused: "paused",
  };
  return map[status] ?? "active";
}

async function userIdFromCustomerId(customerId: string): Promise<string | null> {
  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { userId: true },
  });
  return sub?.userId ?? null;
}

async function userIdFromSubscriptionId(subscriptionId: string): Promise<string | null> {
  const sub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { userId: true },
  });
  return sub?.userId ?? null;
}

// ── Provision ────────────────────────────────────────────────────────

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

// ── Handle checkout ──────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
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

// ── Handle subscription ──────────────────────────────────────────────

async function handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
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

async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription) {
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

// ── Handle invoice ───────────────────────────────────────────────────

async function handleInvoicePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

  const userId = customerId ? await userIdFromCustomerId(customerId) : null;

  const subscriptionId =
    invoice.parent?.type === "subscription_details"
      ? (typeof invoice.parent.subscription_details?.subscription === "string"
          ? invoice.parent.subscription_details.subscription
          : invoice.parent.subscription_details?.subscription?.id)
      : undefined;

  await prisma.paymentEvent.create({
    data: {
      stripeEventId: event.id,
      type: event.type,
      userId: userId ?? null,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: "succeeded",
      stripeCustomerId: customerId ?? null,
      metadata: { invoiceId: invoice.id, subscriptionId: subscriptionId ?? null },
    },
  });

  if (userId && subscriptionId) {
    const sub = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { tier: true },
    });
    if (sub && sub.tier !== "free") {
      const credits = TIER_LIMITS[sub.tier]?.creditsPerMonth;
      if (credits) {
        await createNotification({
          userId,
          type: "credit_update",
          title: "Credits refreshed",
          message: `Your monthly ${credits.toLocaleString()} credits are ready to use.`,
          href: "/settings/billing",
        });
      }
    }
  }

  logger.info(
    { eventId: event.id, userId, amount: invoice.amount_paid },
    "billing-webhook: invoice payment succeeded"
  );
}

async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

  const userId = customerId ? await userIdFromCustomerId(customerId) : null;

  const subscriptionId =
    invoice.parent?.type === "subscription_details"
      ? (typeof invoice.parent.subscription_details?.subscription === "string"
          ? invoice.parent.subscription_details.subscription
          : invoice.parent.subscription_details?.subscription?.id)
      : undefined;

  await prisma.paymentEvent.create({
    data: {
      stripeEventId: event.id,
      type: event.type,
      userId: userId ?? null,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: "failed",
      stripeCustomerId: customerId ?? null,
      metadata: { invoiceId: invoice.id, subscriptionId: subscriptionId ?? null },
    },
  });

  if (userId) {
    await prisma.subscription.updateMany({
      where: { userId },
      data: { status: "past_due" },
    });

    await createNotification({
      userId,
      type: "payment_failed",
      title: "Payment Failed",
      message:
        "Your latest payment failed. Please update your payment method to keep your subscription active.",
      href: "/settings/billing",
    });
  }

  logger.warn(
    { eventId: event.id, userId, amount: invoice.amount_due },
    "billing-webhook: invoice payment failed"
  );
}

// ── Event router ─────────────────────────────────────────────────────

export async function handleBillingEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event);
      break;
    default:
      logger.debug({ eventType: event.type }, "billing-webhook: unhandled event type");
  }
}
