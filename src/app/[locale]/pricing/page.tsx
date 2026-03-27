"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { SparklesIcon, ClockIcon } from "@heroicons/react/24/outline";
import { track } from "@/lib/analytics";

interface Tier {
  id: "free" | "starter" | "pro" | "studio";
  name: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  priceNote: string;
  credits: string;
  featured: boolean;
  cta: string;
  features: Array<{ label: string; included: boolean }>;
}

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: null,
    annualPrice: null,
    priceNote: "forever",
    credits: "200 credits/mo",
    featured: false,
    cta: "Get started",
    features: [
      { label: "200 monthly credits", included: true },
      { label: "5 generations/hour", included: true },
      { label: "20 downloads/hour", included: true },
      { label: "Library & playlists", included: true },
      { label: "Mashup Studio", included: false },
      { label: "Priority Queue", included: false },
      { label: "Vocal Separation", included: false },
      { label: "API Key Access", included: false },
    ],
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 9.99,
    annualPrice: 7.99,
    priceNote: "per month",
    credits: "1,500 credits/mo",
    featured: false,
    cta: "Upgrade to Starter",
    features: [
      { label: "1,500 monthly credits", included: true },
      { label: "25 generations/hour", included: true },
      { label: "100 downloads/hour", included: true },
      { label: "Library & playlists", included: true },
      { label: "Mashup Studio", included: true },
      { label: "Priority Queue", included: false },
      { label: "Vocal Separation", included: false },
      { label: "API Key Access", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 24.99,
    annualPrice: 19.99,
    priceNote: "per month",
    credits: "5,000 credits/mo",
    featured: true,
    cta: "Upgrade to Pro",
    features: [
      { label: "5,000 monthly credits", included: true },
      { label: "50 generations/hour", included: true },
      { label: "500 downloads/hour", included: true },
      { label: "Library & playlists", included: true },
      { label: "Mashup Studio", included: true },
      { label: "Priority Queue", included: true },
      { label: "Vocal Separation", included: true },
      { label: "API Key Access", included: false },
    ],
  },
  {
    id: "studio",
    name: "Studio",
    monthlyPrice: 49.99,
    annualPrice: 39.99,
    priceNote: "per month",
    credits: "15,000 credits/mo",
    featured: false,
    cta: "Upgrade to Studio",
    features: [
      { label: "15,000 monthly credits", included: true },
      { label: "100 generations/hour", included: true },
      { label: "Unlimited downloads", included: true },
      { label: "Library & playlists", included: true },
      { label: "Mashup Studio", included: true },
      { label: "Priority Queue", included: true },
      { label: "Vocal Separation", included: true },
      { label: "API Key Access", included: true },
    ],
  },
];

const FEATURE_MATRIX = [
  { label: "Monthly credits", values: ["200", "1,500", "5,000", "15,000"] },
  { label: "Generations / hour", values: ["5", "25", "50", "100"] },
  { label: "Downloads / hour", values: ["20", "100", "500", "Unlimited"] },
  { label: "Library & playlists", values: [true, true, true, true] },
  { label: "Mashup Studio", values: [false, true, true, true] },
  { label: "Priority Queue", values: [false, false, true, true] },
  { label: "Vocal Separation", values: [false, false, true, true] },
  { label: "API Key Access", values: [false, false, false, true] },
];

function TierCard({
  tier,
  annual,
  onUpgrade,
  loading,
  stripeConfigured,
}: {
  tier: Tier;
  annual: boolean;
  onUpgrade: (id: string, annual: boolean) => void;
  loading: string | null;
  stripeConfigured: boolean;
}) {
  const { data: session } = useSession();
  const currentTier =
    (session?.user as unknown as Record<string, unknown>)?.subscriptionTier as string ?? "free";
  const isCurrent = currentTier === tier.id;
  const isLoading = loading === tier.id;

  const price =
    tier.monthlyPrice === null
      ? "$0"
      : annual
        ? `$${tier.annualPrice!.toFixed(2)}`
        : `$${tier.monthlyPrice.toFixed(2)}`;

  function handleCta() {
    if (tier.id === "free") return;
    if (!session) {
      window.location.href = "/register";
      return;
    }
    track("pricing_cta_clicked", { tier: tier.id, billing: annual ? "annual" : "monthly" });
    onUpgrade(tier.id, annual);
  }

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 transition-shadow ${
        tier.featured
          ? "border-violet-500 shadow-lg shadow-violet-500/10 bg-violet-50 dark:bg-violet-950/20"
          : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      }`}
    >
      {tier.featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-violet-600 text-white shadow">
            <SparklesIcon className="w-3.5 h-3.5" />
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{tier.name}</h3>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-gray-900 dark:text-white">{price}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">/{tier.priceNote}</span>
        </div>
        {annual && tier.monthlyPrice !== null && (
          <p className="mt-0.5 text-xs text-green-600 dark:text-green-400 font-medium">
            Save ${((tier.monthlyPrice - tier.annualPrice!) * 12).toFixed(0)}/yr vs monthly
          </p>
        )}
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{tier.credits}</p>
      </div>

      <ul className="space-y-2.5 flex-1 mb-6">
        {tier.features.map((f) => (
          <li key={f.label} className="flex items-center gap-2.5 text-sm">
            {f.included ? (
              <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
            ) : (
              <XMarkIcon className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
            )}
            <span
              className={
                f.included ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-600"
              }
            >
              {f.label}
            </span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <div className="w-full text-center py-2 px-4 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
          Current plan
        </div>
      ) : tier.id === "free" ? (
        <Link
          href="/register"
          className="w-full text-center py-2 px-4 rounded-xl text-sm font-semibold border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {tier.cta}
        </Link>
      ) : !stripeConfigured ? (
        <div
          className="w-full text-center py-2 px-4 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1.5 cursor-default"
          title="Subscriptions are not yet available"
        >
          <ClockIcon className="w-4 h-4" />
          Coming soon
        </div>
      ) : (
        <button
          onClick={handleCta}
          disabled={isLoading}
          className={`w-full py-2 px-4 rounded-xl text-sm font-semibold transition-colors ${
            tier.featured
              ? "bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
              : "bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 disabled:opacity-60"
          }`}
        >
          {isLoading ? "Redirecting…" : tier.cta}
        </button>
      )}
    </div>
  );
}

function FeatureMatrixCell({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") {
    return value ? (
      <CheckIcon className="w-5 h-5 text-green-500 mx-auto" />
    ) : (
      <XMarkIcon className="w-5 h-5 text-gray-300 dark:text-gray-600 mx-auto" />
    );
  }
  return <span className="text-sm text-gray-700 dark:text-gray-300">{value}</span>;
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(true);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => setStripeConfigured(d.stripeConfigured ?? true))
      .catch(() => {/* keep optimistic default */});
  }, []);

  async function handleUpgrade(tier: string, isAnnual: boolean) {
    setLoading(tier);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, annual: isAnnual }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to start checkout");
        return;
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Start free. Upgrade when you need more credits, speed, or features.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span
            className={`text-sm font-medium ${!annual ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}
          >
            Monthly
          </span>
          <button
            onClick={() => {
              const next = !annual;
              setAnnual(next);
              track("pricing_billing_toggle", { billing: next ? "annual" : "monthly" });
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
              annual ? "bg-violet-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
            role="switch"
            aria-checked={annual}
            aria-label="Toggle annual billing"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                annual ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium ${annual ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}
          >
            Annual
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Save 20%
            </span>
          </span>
        </div>

        {!stripeConfigured && (
          <div className="mb-8 max-w-xl mx-auto p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400 text-center flex items-center justify-center gap-2">
            <ClockIcon className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Subscriptions coming soon.</strong> Paid plans are not yet available — check back shortly.
            </span>
          </div>
        )}

        {error && (
          <div className="mb-8 max-w-md mx-auto p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Tier cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {TIERS.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              annual={annual}
              onUpgrade={handleUpgrade}
              loading={loading}
              stripeConfigured={stripeConfigured}
            />
          ))}
        </div>

        {/* Feature comparison matrix */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
            Compare all features
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-500 dark:text-gray-400 w-1/3">
                    Feature
                  </th>
                  {TIERS.map((t) => (
                    <th
                      key={t.id}
                      className={`px-6 py-4 text-sm font-bold text-center ${
                        t.featured
                          ? "text-violet-600 dark:text-violet-400"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX.map((row, i) => (
                  <tr
                    key={row.label}
                    className={`border-b border-gray-100 dark:border-gray-800/60 last:border-0 ${
                      i % 2 === 0
                        ? "bg-gray-50 dark:bg-gray-900/50"
                        : "bg-white dark:bg-gray-900"
                    }`}
                  >
                    <td className="px-6 py-3.5 text-sm text-gray-700 dark:text-gray-300 font-medium">
                      {row.label}
                    </td>
                    {row.values.map((v, vi) => (
                      <td key={vi} className="px-6 py-3.5 text-center">
                        <FeatureMatrixCell value={v} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-10 text-center text-sm text-gray-500 dark:text-gray-400">
          All plans include a 30-day grace period for existing users.{" "}
          <Link
            href="/settings/billing"
            className="text-violet-600 dark:text-violet-400 hover:underline"
          >
            Manage your subscription
          </Link>
        </p>
      </div>
    </div>
  );
}
