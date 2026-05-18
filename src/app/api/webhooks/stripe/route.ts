import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { handleBillingEvent } from "@/lib/billing";
import { createStripeWebhookRoute } from "@/lib/billing/webhook-route";
import { webhookAck } from "@/lib/webhooks/ack";

export const dynamic = "force-dynamic";

export const POST = createStripeWebhookRoute({
  routeTag: "/api/webhooks/stripe",
  onInvalidSignature: (err) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    return `Webhook signature verification failed: ${message}`;
  },
  onDuplicate: () => webhookAck({ duplicate: true }),
  onHandleEvent: async (event) => {
    logger.info({ eventId: event.id, type: event.type }, "Stripe webhook received");
    await handleBillingEvent(event);
  },
  onError: (err, event) => {
    logger.error({ err, eventId: event.id, type: event.type }, "Error handling Stripe webhook event");
    return NextResponse.json({ error: "Internal error processing event" }, { status: 500 });
  },
});
