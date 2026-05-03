import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications";
import { TIER_LIMITS } from "./tiers";
import { userIdFromCustomerId } from "./resolve-user";

export async function handleInvoicePaymentSucceeded(event: Stripe.Event) {
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
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: "succeeded",
      stripeCustomerId: customerId ?? null,
      metadata: { invoiceId: invoice.id, subscriptionId: subscriptionId ?? null },
    },
  });

  if (userId && subscriptionId) {
    const sub = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { tier: true },
    });
    if (sub && sub.tier !== "free") {
      const credits = TIER_LIMITS[sub.tier]?.creditsPerMonth;
      if (credits) {
        await createNotification({
          userId,
          type: "credit_update",
          title: "Credits refreshed",
          message: `Your monthly ${credits.toLocaleString()} credits are ready to use.`,
          href: "/settings/billing",
        });
      }
    }
  }

  logger.info(
    { eventId: event.id, userId, amount: invoice.amount_paid },
    "billing-webhook: invoice payment succeeded"
  );
}

export async function handleInvoicePaymentFailed(event: Stripe.Event) {
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
    await prisma.subscription.updateMany({
      where: { userId },
      data: { status: "past_due" },
    });

    await createNotification({
      userId,
      type: "payment_failed",
      title: "Payment Failed",
      message:
        "Your latest payment failed. Please update your payment method to keep your subscription active.",
      href: "/settings/billing",
    });
  }

  logger.warn(
    { eventId: event.id, userId, amount: invoice.amount_due },
    "billing-webhook: invoice payment failed"
  );
}
