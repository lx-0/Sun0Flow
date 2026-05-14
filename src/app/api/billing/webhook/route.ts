import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { logServerError } from "@/lib/error-logger";
import { handleBillingEvent } from "@/lib/billing";
import { processStripeWebhook } from "@/lib/billing/webhook";

export async function POST(request: NextRequest) {
  return processStripeWebhook({
    request,
    routeTag: "/api/billing/webhook",
    onDuplicate: (event) => {
      logger.info({ eventId: event.id }, "billing-webhook: duplicate event, skipping");
      return NextResponse.json({ received: true });
    },
    onHandleEvent: handleBillingEvent,
    onError: (error, event) => {
      logServerError("billing-webhook-handler", error, {
        route: "/api/billing/webhook",
        params: { eventId: event.id, eventType: event.type },
      });
      return NextResponse.json(
        { error: "Webhook handler failed" },
        { status: 500 }
      );
    },
  });
}
