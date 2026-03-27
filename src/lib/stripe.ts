/**
 * Server-side Stripe client singleton.
 * Import this module only in server-side code (API routes, server components).
 * The client is instantiated lazily so builds succeed without STRIPE_SECRET_KEY set.
 */

import Stripe from "stripe";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("Missing required environment variable: STRIPE_SECRET_KEY");
    }
    _stripe = new Stripe(key, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return _stripe;
}

export default getStripe;

export const STRIPE_WEBHOOK_SECRET = (): string =>
  process.env.STRIPE_WEBHOOK_SECRET ?? "";

export const STRIPE_PRICES = {
  get starter() { return process.env.STRIPE_PRICE_STARTER ?? ""; },
  get pro() { return process.env.STRIPE_PRICE_PRO ?? ""; },
  get studio() { return process.env.STRIPE_PRICE_STUDIO ?? ""; },
} as const;

export const STRIPE_TOPUP_PRICES = {
  get credits_10() { return process.env.STRIPE_PRICE_TOPUP_10 ?? ""; },
  get credits_25() { return process.env.STRIPE_PRICE_TOPUP_25 ?? ""; },
  get credits_50() { return process.env.STRIPE_PRICE_TOPUP_50 ?? ""; },
} as const;

export const TOPUP_PACKAGES = [
  { id: "credits_10" as const, credits: 10, label: "10 Credits", priceLabel: "$0.99" },
  { id: "credits_25" as const, credits: 25, label: "25 Credits", priceLabel: "$1.99" },
  { id: "credits_50" as const, credits: 50, label: "50 Credits", priceLabel: "$3.49" },
];

export type TopupPackageId = "credits_10" | "credits_25" | "credits_50";

/**
 * Returns true if the minimum required Stripe environment variables are set.
 * Safe to call server-side; does not throw.
 */
export function isStripeConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_PRICE_STARTER &&
    process.env.STRIPE_PRICE_PRO &&
    process.env.STRIPE_PRICE_STUDIO
  );
}
