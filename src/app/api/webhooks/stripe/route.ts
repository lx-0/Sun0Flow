import { NextRequest, NextResponse } from "next/server";
import getStripe, { STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type Stripe from "stripe";

// Disable body parsing — we need the raw body for signature verification.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.warn({ err }, `Stripe webhook signature verification failed: ${message}`);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  logger.info({ eventId: event.id, type: event.type }, "Stripe webhook received");

  // Idempotency: skip if we've already processed this event.
  const existing = await prisma.paymentEvent.findUnique({
    where: { stripeEventId: event.id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    logger.error({ err, eventId: event.id, type: event.type }, "Error handling Stripe webhook event");
    return NextResponse.json({ error: "Internal error processing event" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionChange(subscription);
      break;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await recordPaymentEvent(event, invoice.customer as string | null, invoice.amount_paid ?? invoice.amount_due, invoice.currency);
      break;
    }

    default:
      // Record all other events for auditing without processing them.
      await recordPaymentEvent(event, null, null, null);
      break;
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;

  // Look up user by Stripe customer ID (from an existing Subscription record).
  const existing = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
    select: { userId: true },
  });

  if (!existing) {
    logger.warn({ customerId, subscriptionId: subscription.id }, "No user found for Stripe customer ID — skipping subscription upsert");
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? "";
  const tier = priceToTier(priceId);
  const status = subscription.status as string;

  // In Stripe API 2025-03-31+, current_period_start/end moved to SubscriptionItem.
  // Fall back to billing_cycle_anchor, then current epoch to avoid Invalid Date.
  const nowEpoch = Math.floor(Date.now() / 1000);
  const periodStart = item?.current_period_start ?? subscription.billing_cycle_anchor ?? nowEpoch;
  const periodEnd = item?.current_period_end ?? subscription.billing_cycle_anchor ?? nowEpoch;

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      userId: existing.userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      tier,
      status: mapSubscriptionStatus(status),
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    },
    update: {
      stripePriceId: priceId,
      tier,
      status: mapSubscriptionStatus(status),
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    },
  });
}

async function recordPaymentEvent(
  event: Stripe.Event,
  customerId: string | null,
  amount: number | null | undefined,
  currency: string | null | undefined,
): Promise<void> {
  const userId = customerId
    ? (await prisma.subscription.findUnique({ where: { stripeCustomerId: customerId }, select: { userId: true } }))?.userId ?? null
    : null;

  await prisma.paymentEvent.create({
    data: {
      stripeEventId: event.id,
      type: event.type,
      amount: amount ?? null,
      currency: currency ?? null,
      status: "processed",
      stripeCustomerId: customerId,
      userId,
      metadata: event.data.object as object,
    },
  });
}

function priceToTier(priceId: string): "free" | "starter" | "pro" | "studio" {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_STUDIO) return "studio";
  return "free";
}

function mapSubscriptionStatus(status: string): "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired" | "paused" {
  const valid = ["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] as const;
  return (valid as readonly string[]).includes(status)
    ? (status as ReturnType<typeof mapSubscriptionStatus>)
    : "active";
}
