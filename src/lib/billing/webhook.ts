import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import getStripe, { STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

type VerifyWebhookOptions = {
  routeTag: string;
  missingSignatureMessage?: string;
  invalidSignatureMessage?: (error: unknown) => string;
};

type VerifiedStripeWebhook =
  | { event: Stripe.Event; error: null }
  | { event: null; error: NextResponse };

type ProcessStripeWebhookResult = NextResponse;

type ProcessStripeWebhookOptions = {
  request: NextRequest;
  routeTag: string;
  onDuplicate: (event: Stripe.Event) => ProcessStripeWebhookResult;
  onHandleEvent: (event: Stripe.Event) => Promise<void>;
  onError: (error: unknown, event: Stripe.Event) => ProcessStripeWebhookResult;
  onInvalidSignature?: (error: unknown) => string;
};

export async function verifyStripeWebhookRequest(
  request: NextRequest,
  options: VerifyWebhookOptions
): Promise<VerifiedStripeWebhook> {
  const webhookSecret = STRIPE_WEBHOOK_SECRET();
  if (!webhookSecret) {
    logger.error({ route: options.routeTag }, "stripe-webhook: STRIPE_WEBHOOK_SECRET not configured");
    return {
      event: null,
      error: NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 }),
    };
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return {
      event: null,
      error: NextResponse.json(
        { error: options.missingSignatureMessage ?? "Missing stripe-signature header" },
        { status: 400 }
      ),
    };
  }

  const rawBody = await request.text();

  try {
    const event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
    return { event, error: null };
  } catch (error) {
    logger.warn({ err: error, route: options.routeTag }, "stripe-webhook: signature verification failed");
    return {
      event: null,
      error: NextResponse.json(
        { error: options.invalidSignatureMessage?.(error) ?? "Invalid signature" },
        { status: 400 }
      ),
    };
  }
}

export async function processStripeWebhook({
  request,
  routeTag,
  onDuplicate,
  onHandleEvent,
  onError,
  onInvalidSignature,
}: ProcessStripeWebhookOptions): Promise<ProcessStripeWebhookResult> {
  const verified = await verifyStripeWebhookRequest(request, {
    routeTag,
    invalidSignatureMessage: onInvalidSignature,
  });

  if (verified.error) {
    return verified.error;
  }

  const event = verified.event;
  if (!event) {
    logger.error({ route: routeTag }, "stripe-webhook: verified event missing after verification");
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 500 });
  }

  if (await hasProcessedStripeEvent(event.id)) {
    return onDuplicate(event);
  }

  try {
    await onHandleEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    return onError(error, event);
  }
}

export async function hasProcessedStripeEvent(eventId: string): Promise<boolean> {
  const existing = await prisma.paymentEvent.findUnique({
    where: { stripeEventId: eventId },
    select: { id: true },
  });
  return Boolean(existing);
}
