import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import getStripe, { STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { tierFromPriceId, TIER_LIMITS } from "@/lib/billing";
import { logger } from "@/lib/logger";
import { logServerError } from "@/lib/error-logger";
import { SubscriptionStatus } from "@prisma/client";

// POST /api/billing/webhook
// Handles Stripe webhook events. Stripe signature verified via STRIPE_WEBHOOK_SECRET.
export async function POST(request: NextRequest) {
  const webhookSecret = STRIPE_WEBHOOK_SECRET();
  if (!webhookSecret) {
    logger.error("billing-webhook: STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    logger.warn({ err }, "billing-webhook: signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency check — skip if we already processed this event
  const existing = await prisma.paymentEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (existing) {
    logger.info({ eventId: event.id }, "billing-webhook: duplicate event, skipping");
    return NextResponse.json({ received: true });
  }

  try {
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

    return NextResponse.json({ received: true });
  } catch (error) {
    logServerError("billing-webhook-handler", error, {
      route: "/api/billing/webhook",
      params: { eventId: event.id, eventType: event.type },
    });
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  const userId = session.metadata?.userId;

  if (!customerId || !subscriptionId || !userId) {
    logger.warn(
      { customerId, subscriptionId, userId },
      "billing-webhook: checkout.session.completed missing required fields"
    );
    return;
  }

  // Fetch full subscription details from Stripe to get price / period info
  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
  const item = stripeSub.items.data[0];
  const priceId = item?.price?.id ?? "";
  const tier = tierFromPriceId(priceId);
  const limits = TIER_LIMITS[tier];

  // period dates live on the subscription item in the new Stripe API
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

async function handleInvoicePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

  const userId = customerId ? await userIdFromCustomerId(customerId) : null;

  // Resolve subscriptionId from new parent structure
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
    // Update subscription to PAST_DUE
    await prisma.subscription.updateMany({
      where: { userId },
      data: { status: "past_due" },
    });

    // Notify the user
    await prisma.notification.create({
      data: {
        userId,
        type: "payment_failed",
        title: "Payment Failed",
        message:
          "Your latest payment failed. Please update your payment method to keep your subscription active.",
        href: "/settings/billing",
      },
    });
  }

  logger.warn(
    { eventId: event.id, userId, amount: invoice.amount_due },
    "billing-webhook: invoice payment failed"
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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
