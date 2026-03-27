"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  CreditCardIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  TIER_LABELS,
  TIER_BADGE_COLORS,
  type SubscriptionTier,
} from "@/lib/feature-gates";

interface SubscriptionData {
  tier: SubscriptionTier;
  status: string;
  creditsPerMonth: number;
  generationsPerHour: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
}

interface CreditUsage {
  budget: number;
  creditsUsedThisMonth: number;
  creditsRemaining: number;
  usagePercent: number;
  isLow: boolean;
}

interface InvoiceItem {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  invoicePdf: string | null;
  hostedInvoiceUrl: string | null;
  description: string | null;
}

const TIER_MONTHLY_PRICE: Record<SubscriptionTier, number | null> = {
  free: null,
  starter: 9.99,
  pro: 24.99,
  studio: 49.99,
};

const CANCELLATION_REASONS = [
  "Too expensive",
  "Not using it enough",
  "Switching to another service",
  "Missing features I need",
  "Technical issues",
  "Other",
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    trialing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    past_due: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    canceled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    unpaid: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    open: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    void: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    uncollectible: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const label: Record<string, string> = {
    active: "Active",
    trialing: "Trial",
    past_due: "Past Due",
    canceled: "Canceled",
    unpaid: "Unpaid",
    paid: "Paid",
    open: "Open",
    void: "Void",
    uncollectible: "Uncollectible",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
        colorMap[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
      }`}
    >
      {label[status] ?? status}
    </span>
  );
}

function CancelDialog({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState(CANCELLATION_REASONS[0]);
  const [other, setOther] = useState("");

  const finalReason = reason === "Other" ? other.trim() || "Other" : reason;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Cancel subscription?
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Your access continues until the end of the current billing period. You can resubscribe
              at any time.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Why are you cancelling?
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {CANCELLATION_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {reason === "Other" && (
            <textarea
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="Tell us more (optional)"
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Keep subscription
          </button>
          <button
            onClick={() => onConfirm(finalReason)}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
          >
            {loading && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
            Confirm cancellation
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [credits, setCredits] = useState<CreditUsage | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  const successParam = searchParams.get("success");
  const cancelledParam = searchParams.get("cancelled");

  const fetchData = useCallback(async () => {
    try {
      const [subRes, creditRes, invoiceRes] = await Promise.all([
        fetch("/api/billing/subscription"),
        fetch("/api/credits"),
        fetch("/api/billing/invoices"),
      ]);
      if (subRes.ok) setSub(await subRes.json());
      if (creditRes.ok) setCredits(await creditRes.json());
      if (invoiceRes.ok) {
        const data = await invoiceRes.json();
        setInvoices(data.invoices ?? []);
      }
    } catch {
      // keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleManage() {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Could not open billing portal");
        return;
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleCancel(reason: string) {
    setCancelLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Could not cancel subscription");
        setShowCancelDialog(false);
        return;
      }
      setSub((prev) => (prev ? { ...prev, cancelAtPeriodEnd: true } : prev));
      setCancelSuccess(true);
      setShowCancelDialog(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setShowCancelDialog(false);
    } finally {
      setCancelLoading(false);
    }
  }

  const tier = (sub?.tier ?? "free") as SubscriptionTier;
  const isPaid = tier !== "free";
  const monthlyPrice = TIER_MONTHLY_PRICE[tier];
  const isPastDue = sub?.status === "past_due" || sub?.status === "unpaid";

  return (
    <AppShell>
      {showCancelDialog && (
        <CancelDialog
          onConfirm={handleCancel}
          onCancel={() => setShowCancelDialog(false)}
          loading={cancelLoading}
        />
      )}

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <CreditCardIcon className="w-6 h-6 text-violet-500" />
          Billing &amp; Subscription
        </h1>

        {/* Failed payment banner */}
        {isPastDue && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Payment failed</p>
              <p>
                Your last payment was unsuccessful. Please update your payment method to keep your
                subscription active.{" "}
                <button
                  onClick={handleManage}
                  disabled={portalLoading}
                  className="underline font-medium hover:no-underline"
                >
                  {portalLoading ? "Opening…" : "Fix payment method"}
                </button>
              </p>
            </div>
          </div>
        )}

        {/* Cancellation success */}
        {cancelSuccess && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm">
            <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>
              Cancellation confirmed. Your access continues until{" "}
              <strong>{formatDate(sub?.currentPeriodEnd ?? null)}</strong>.
            </p>
          </div>
        )}

        {/* Success / cancel banners from Stripe checkout redirect */}
        {successParam && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
            <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Subscription activated!</p>
              <p>Your plan has been upgraded. It may take a moment for changes to reflect.</p>
            </div>
          </div>
        )}
        {cancelledParam && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm">
            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>Checkout was cancelled. Your plan was not changed.</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-violet-400" />
          </div>
        ) : (
          <>
            {/* Current plan card */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                  Current Plan
                </h2>
                {sub && <StatusBadge status={sub.status} />}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`px-2.5 py-1 rounded-lg text-sm font-bold uppercase tracking-wide ${TIER_BADGE_COLORS[tier]}`}
                >
                  {TIER_LABELS[tier]}
                </span>
                {monthlyPrice !== null && (
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    ${monthlyPrice.toFixed(2)}/month
                  </span>
                )}
                {sub?.cancelAtPeriodEnd && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Cancels on {formatDate(sub.currentPeriodEnd)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Credits/month</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {sub?.creditsPerMonth.toLocaleString() ?? "200"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Generations/hour</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {sub?.generationsPerHour ?? 5}
                  </p>
                </div>
                {sub?.currentPeriodStart && (
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Period start</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatDate(sub.currentPeriodStart)}
                    </p>
                  </div>
                )}
                {sub?.currentPeriodEnd && (
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">
                      {sub.cancelAtPeriodEnd ? "Expires" : "Renews"}
                    </p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatDate(sub.currentPeriodEnd)}
                    </p>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                {isPaid ? (
                  <>
                    <Link
                      href="/pricing"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Change Plan
                    </Link>
                    <button
                      onClick={handleManage}
                      disabled={portalLoading}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-60"
                    >
                      {portalLoading ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <CreditCardIcon className="w-4 h-4" />
                      )}
                      Manage subscription
                    </button>
                    {!sub?.cancelAtPeriodEnd && (
                      <button
                        onClick={() => setShowCancelDialog(true)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        Cancel subscription
                      </button>
                    )}
                  </>
                ) : (
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                  >
                    Upgrade plan
                    <ChevronRightIcon className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>

            {/* Credit usage card */}
            {credits && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                  Credit Usage This Month
                </h2>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {credits.creditsUsedThisMonth.toLocaleString()} /{" "}
                      {credits.budget.toLocaleString()} used
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {credits.creditsRemaining.toLocaleString()} remaining
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        credits.isLow
                          ? "bg-amber-500"
                          : credits.usagePercent > 50
                            ? "bg-violet-500"
                            : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(100, credits.usagePercent)}%` }}
                    />
                  </div>
                </div>

                {credits.isLow && !isPaid && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
                    <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Running low on credits</p>
                      <p>
                        Upgrade to get more credits and avoid interruptions.{" "}
                        <Link href="/pricing" className="underline font-medium">
                          View plans
                        </Link>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Invoice history */}
            {invoices.length > 0 && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                  Invoice History
                </h2>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                        <th className="pb-2 pr-4 font-medium">Date</th>
                        <th className="pb-2 pr-4 font-medium">Amount</th>
                        <th className="pb-2 pr-4 font-medium">Status</th>
                        <th className="pb-2 font-medium text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {invoices.map((inv) => (
                        <tr key={inv.id}>
                          <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                            {formatDate(inv.date)}
                          </td>
                          <td className="py-2.5 pr-4 font-medium text-gray-900 dark:text-white">
                            {formatAmount(inv.amount, inv.currency)}
                          </td>
                          <td className="py-2.5 pr-4">
                            <StatusBadge status={inv.status} />
                          </td>
                          <td className="py-2.5 text-right">
                            {inv.invoicePdf ? (
                              <a
                                href={inv.invoicePdf}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline"
                                aria-label="Download PDF invoice"
                              >
                                <ArrowDownTrayIcon className="w-4 h-4" />
                                PDF
                              </a>
                            ) : inv.hostedInvoiceUrl ? (
                              <a
                                href={inv.hostedInvoiceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-violet-600 dark:text-violet-400 hover:underline"
                              >
                                View
                              </a>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Plans comparison link */}
            {!isPaid && (
              <div className="text-center">
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-1 text-sm text-violet-600 dark:text-violet-400 hover:underline font-medium"
                >
                  View all plans &amp; features
                  <ChevronRightIcon className="w-4 h-4" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
