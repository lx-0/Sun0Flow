import { NextRequest, NextResponse } from "next/server";
import getStripe, { STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { handleBillingEvent } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.warn({ err }, `Stripe webhook signature verification failed: ${message}`);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  logger.info({ eventId: event.id, type: event.type }, "Stripe webhook received");

  const existing = await prisma.paymentEvent.findUnique({
    where: { stripeEventId: event.id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleBillingEvent(event);
  } catch (err) {
    logger.error({ err, eventId: event.id, type: event.type }, "Error handling Stripe webhook event");
    return NextResponse.json({ error: "Internal error processing event" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
