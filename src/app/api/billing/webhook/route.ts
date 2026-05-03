import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import getStripe, { STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logServerError } from "@/lib/error-logger";
import { handleBillingEvent } from "@/lib/billing";

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

  const existing = await prisma.paymentEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (existing) {
    logger.info({ eventId: event.id }, "billing-webhook: duplicate event, skipping");
    return NextResponse.json({ received: true });
  }

  try {
    await handleBillingEvent(event);
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
