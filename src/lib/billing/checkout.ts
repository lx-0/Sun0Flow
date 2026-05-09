import getStripe, {
  STRIPE_PRICES,
  STRIPE_TOPUP_PRICES,
  TOPUP_PACKAGES,
  type TopupPackageId,
} from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOrCreateStripeCustomer, TIER_LIMITS } from "./resolve";

// ── Types ───────────────────────────────────────────────────────────

const VALID_TIERS = ["starter", "pro", "studio"] as const;
type PaidTier = (typeof VALID_TIERS)[number];

const PRICE_MAP: Record<PaidTier, () => string> = {
  starter: () => STRIPE_PRICES.starter,
  pro: () => STRIPE_PRICES.pro,
  studio: () => STRIPE_PRICES.studio,
};

const VALID_PACKAGES = TOPUP_PACKAGES.map((p) => p.id);

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; code: string; message: string; status: number };

export type CancelResult =
  | { ok: true }
  | { ok: false; code: string; message: string; status: number };

export interface InvoiceItem {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  invoicePdf: string | null;
  hostedInvoiceUrl: string | null;
  description: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function appUrl(): string {
  return process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}

function isRealPaidSub(sub: {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: string;
}): boolean {
  return (
    !sub.stripeSubscriptionId.startsWith("free_") &&
    !sub.stripeCustomerId.startsWith("free_") &&
    (sub.status === "active" || sub.status === "trialing")
  );
}

async function requireUserEmail(userId: string): Promise<{ email: string; name: string | null } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  return user?.email ? { email: user.email, name: user.name } : null;
}

// ── Checkout ────────────────────────────────────────────────────────

export async function createCheckoutSession(
  userId: string,
  tier: string,
): Promise<CheckoutResult> {
  if (!tier || !VALID_TIERS.includes(tier as PaidTier)) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Invalid tier. Must be one of: starter, pro, studio", status: 400 };
  }

  const priceId = PRICE_MAP[tier as PaidTier]();
  if (!priceId) {
    return { ok: false, code: "CONFIGURATION_ERROR", message: `Stripe price not configured for tier: ${tier}`, status: 500 };
  }

  const existingSub = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeSubscriptionId: true, stripeCustomerId: true, stripePriceId: true, status: true },
  });

  if (existingSub && isRealPaidSub(existingSub)) {
    return changePlan(userId, existingSub, priceId);
  }

  return createNewSubscription(userId, priceId);
}

async function changePlan(
  userId: string,
  existingSub: { stripeSubscriptionId: string; stripePriceId: string },
  priceId: string,
): Promise<CheckoutResult> {
  if (existingSub.stripePriceId === priceId) {
    return { ok: false, code: "SAME_PLAN", message: "Already subscribed to this plan", status: 400 };
  }

  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(existingSub.stripeSubscriptionId);
  const itemId = stripeSub.items.data[0]?.id;

  if (!itemId) {
    return { ok: false, code: "SUBSCRIPTION_ERROR", message: "Could not find subscription item to update", status: 500 };
  }

  await stripe.subscriptions.update(existingSub.stripeSubscriptionId, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: "create_prorations",
    metadata: { userId },
  });

  logger.info({ userId, newPriceId: priceId, subscriptionId: existingSub.stripeSubscriptionId }, "billing: plan changed inline");

  return { ok: true, url: `${appUrl()}/settings/billing?success=1` };
}

async function createNewSubscription(
  userId: string,
  priceId: string,
): Promise<CheckoutResult> {
  const user = await requireUserEmail(userId);
  if (!user) {
    return { ok: false, code: "USER_ERROR", message: "User email not found", status: 400 };
  }

  const customerId = await getOrCreateStripeCustomer(userId, user.email, user.name);
  const stripe = getStripe();
  const base = appUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/settings/billing?success=1`,
    cancel_url: `${base}/settings/billing?cancelled=1`,
    metadata: { userId },
    subscription_data: { metadata: { userId } },
  });

  return { ok: true, url: session.url! };
}

// ── Cancel ──────────────────────────────────────────────────────────

export async function cancelSubscription(
  userId: string,
  reason?: string,
): Promise<CancelResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      status: true,
      cancelAtPeriodEnd: true,
    },
  });

  if (
    !subscription ||
    subscription.stripeSubscriptionId.startsWith("free_") ||
    subscription.stripeCustomerId.startsWith("free_")
  ) {
    return { ok: false, code: "NO_SUBSCRIPTION", message: "No active paid subscription to cancel", status: 400 };
  }

  if (subscription.cancelAtPeriodEnd) {
    return { ok: false, code: "ALREADY_CANCELLED", message: "Subscription is already scheduled for cancellation", status: 400 };
  }

  const stripe = getStripe();
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true,
    metadata: reason ? { cancellation_reason: reason } : undefined,
  });

  await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: true },
  });

  return { ok: true };
}

// ── Top-up ──────────────────────────────────────────────────────────

export async function createTopupSession(
  userId: string,
  packageId: string,
): Promise<CheckoutResult> {
  if (!packageId || !VALID_PACKAGES.includes(packageId as TopupPackageId)) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Invalid package. Must be one of: credits_10, credits_25, credits_50", status: 400 };
  }

  const packageDef = TOPUP_PACKAGES.find((p) => p.id === packageId)!;
  const priceId = STRIPE_TOPUP_PRICES[packageId as TopupPackageId];
  if (!priceId) {
    return { ok: false, code: "CONFIGURATION_ERROR", message: `Stripe price not configured for package: ${packageId}`, status: 500 };
  }

  const user = await requireUserEmail(userId);
  if (!user) {
    return { ok: false, code: "USER_ERROR", message: "User email not found", status: 400 };
  }

  const customerId = await getOrCreateStripeCustomer(userId, user.email, user.name);
  const stripe = getStripe();
  const base = appUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/settings/billing?topup_success=1`,
    cancel_url: `${base}/settings/billing?topup_cancelled=1`,
    metadata: {
      userId,
      topupPackage: packageId,
      topupCredits: String(packageDef.credits),
    },
  });

  return { ok: true, url: session.url! };
}

export async function getTopupHistory(userId: string) {
  return prisma.creditTopUp.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      credits: true,
      amountCents: true,
      currency: true,
      expiresAt: true,
      createdAt: true,
    },
  });
}

// ── Portal ──────────────────────────────────────────────────────────

export async function createPortalSession(
  userId: string,
): Promise<CheckoutResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  });

  if (!subscription || subscription.stripeCustomerId.startsWith("free_")) {
    return { ok: false, code: "NO_SUBSCRIPTION", message: "No active paid subscription found", status: 400 };
  }

  const stripe = getStripe();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${appUrl()}/settings/billing`,
  });

  return { ok: true, url: portalSession.url };
}

// ── Invoices ────────────────────────────────────────────────────────

export async function getInvoices(userId: string): Promise<InvoiceItem[]> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  });

  if (!subscription || subscription.stripeCustomerId.startsWith("free_")) {
    return [];
  }

  const stripe = getStripe();
  const stripeInvoices = await stripe.invoices.list({
    customer: subscription.stripeCustomerId,
    limit: 12,
  });

  return stripeInvoices.data.map((inv) => ({
    id: inv.id,
    date: new Date((inv.created ?? 0) * 1000).toISOString(),
    amount: inv.amount_paid ?? inv.total ?? 0,
    currency: inv.currency ?? "usd",
    status: inv.status ?? "unknown",
    invoicePdf: inv.invoice_pdf ?? null,
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    description: inv.lines?.data?.[0]?.description ?? null,
  }));
}

// ── Subscription status ─────────────────────────────────────────────

export async function getSubscriptionStatus(userId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    const limits = TIER_LIMITS.free;
    return {
      tier: "free" as const,
      status: "active" as const,
      creditsPerMonth: limits.creditsPerMonth,
      generationsPerHour: limits.generationsPerHour,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEnd: null,
    };
  }

  const limits = TIER_LIMITS[subscription.tier];

  return {
    tier: subscription.tier,
    status: subscription.status,
    creditsPerMonth: limits.creditsPerMonth,
    generationsPerHour: limits.generationsPerHour,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    trialEnd: subscription.trialEnd ?? null,
  };
}
