import Stripe from "stripe";
import { logger } from "@/lib/logger";
import { handleCheckoutCompleted } from "./handle-checkout";
import { handleSubscriptionUpdated, handleSubscriptionDeleted } from "./handle-subscription";
import { handleInvoicePaymentSucceeded, handleInvoicePaymentFailed } from "./handle-invoice";

export { TIER_LIMITS, tierFromPriceId } from "./tiers";
export type { TierLimits } from "./tiers";
export { ensureFreeSubscription, getOrCreateStripeCustomer } from "./provision";

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
