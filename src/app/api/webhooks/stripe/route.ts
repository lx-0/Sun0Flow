import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { handleBillingEvent } from "@/lib/billing";
import { processStripeWebhook } from "@/lib/billing/webhook";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return processStripeWebhook({
    request: req,
    routeTag: "/api/webhooks/stripe",
    onInvalidSignature: (err) => {
      const message = err instanceof Error ? err.message : "Unknown error";
      return `Webhook signature verification failed: ${message}`;
    },
    onDuplicate: (event) => {
      return NextResponse.json({ received: true, duplicate: true });
    },
    onHandleEvent: async (event) => {
      logger.info({ eventId: event.id, type: event.type }, "Stripe webhook received");
      await handleBillingEvent(event);
    },
    onError: (err, event) => {
      logger.error({ err, eventId: event.id, type: event.type }, "Error handling Stripe webhook event");
      return NextResponse.json({ error: "Internal error processing event" }, { status: 500 });
    },
  });
}
