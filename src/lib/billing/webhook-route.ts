import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { processStripeWebhook } from "@/lib/billing/webhook";

type CreateStripeWebhookRouteOptions = {
  routeTag: string;
  onDuplicate: (event: Stripe.Event) => NextResponse;
  onHandleEvent: (event: Stripe.Event) => Promise<void>;
  onError: (error: unknown, event: Stripe.Event) => NextResponse;
  onInvalidSignature?: (error: unknown) => string;
};

export function createStripeWebhookRoute(options: CreateStripeWebhookRouteOptions) {
  return async function POST(request: NextRequest) {
    return processStripeWebhook({
      request,
      routeTag: options.routeTag,
      onInvalidSignature: options.onInvalidSignature,
      onDuplicate: options.onDuplicate,
      onHandleEvent: options.onHandleEvent,
      onError: options.onError,
    });
  };
}
