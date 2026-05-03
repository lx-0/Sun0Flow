import Stripe from "stripe";
import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function stripeStatusToPrisma(status: Stripe.Subscription.Status): SubscriptionStatus {
  const map: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "unpaid",
    incomplete: "incomplete",
    incomplete_expired: "incomplete_expired",
    paused: "paused",
  };
  return map[status] ?? "active";
}

export async function userIdFromCustomerId(customerId: string): Promise<string | null> {
  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { userId: true },
  });
  return sub?.userId ?? null;
}

export async function userIdFromSubscriptionId(subscriptionId: string): Promise<string | null> {
  const sub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { userId: true },
  });
  return sub?.userId ?? null;
}
