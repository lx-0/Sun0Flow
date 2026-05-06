import Stripe from "stripe";
import { SubscriptionTier, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Stripe → domain mappings ────────────────────────────────────────

export function tierFromPriceId(priceId: string): SubscriptionTier {
  const { STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_STUDIO } =
    process.env;
  if (priceId === STRIPE_PRICE_STARTER) return "starter";
  if (priceId === STRIPE_PRICE_PRO) return "pro";
  if (priceId === STRIPE_PRICE_STUDIO) return "studio";
  return "free";
}

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

// ── Subscription resolution ─────────────────────────────────────────

export interface SubscriptionDetails {
  tier: SubscriptionTier;
  priceId: string;
  periodStart: Date;
  periodEnd: Date;
}

export function resolveSubscriptionDetails(stripeSub: Stripe.Subscription): SubscriptionDetails {
  const item = stripeSub.items.data[0];
  const priceId = item?.price?.id ?? "";
  const tier = tierFromPriceId(priceId);

  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : new Date();
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();

  return { tier, priceId, periodStart, periodEnd };
}

// ── Invoice resolution ──────────────────────────────────────────────

export interface InvoiceContext {
  invoice: Stripe.Invoice;
  customerId: string | undefined;
  userId: string | null;
  subscriptionId: string | undefined;
}

export async function resolveInvoiceContext(event: Stripe.Event): Promise<InvoiceContext> {
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

  return { invoice, customerId, userId, subscriptionId };
}

// ── Payment event recording ─────────────────────────────────────────

export async function recordPaymentEvent(
  event: Stripe.Event,
  opts: {
    userId: string | null;
    amount: number;
    currency: string;
    status: "succeeded" | "failed";
    customerId: string | undefined;
    subscriptionId: string | undefined;
    invoiceId: string;
  },
): Promise<void> {
  await prisma.paymentEvent.create({
    data: {
      stripeEventId: event.id,
      type: event.type,
      userId: opts.userId ?? null,
      amount: opts.amount,
      currency: opts.currency,
      status: opts.status,
      stripeCustomerId: opts.customerId ?? null,
      metadata: { invoiceId: opts.invoiceId, subscriptionId: opts.subscriptionId ?? null },
    },
  });
}

// ── User lookup ─────────────────────────────────────────────────────

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
