"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { XMarkIcon, SparklesIcon, BoltIcon, ClockIcon } from "@heroicons/react/24/outline";
import { track } from "@/lib/analytics";

interface UpgradeModalProps {
  trigger: "no_credits" | "low_credits" | "feature_gate";
  onClose: () => void;
}

const COPY: Record<UpgradeModalProps["trigger"], { title: string; body: string }> = {
  no_credits: {
    title: "You've used all your free credits",
    body: "Upgrade to keep generating music. Plans start at $7.99/mo.",
  },
  low_credits: {
    title: "Running low on credits",
    body: "You have just a few credits left this month. Upgrade to keep the music going.",
  },
  feature_gate: {
    title: "This feature requires a paid plan",
    body: "Unlock Mashup Studio, Priority Queue, Vocal Separation, and more.",
  },
};

const PLAN_HIGHLIGHTS = [
  { tier: "Starter", price: "$7.99/mo", credits: "1,500 credits", highlight: false },
  { tier: "Pro", price: "$19.99/mo", credits: "5,000 credits", highlight: true },
  { tier: "Studio", price: "$39.99/mo", credits: "15,000 credits", highlight: false },
];

export function UpgradeModal({ trigger, onClose }: UpgradeModalProps) {
  const { title, body } = COPY[trigger];
  const [stripeConfigured, setStripeConfigured] = useState(true);

  useEffect(() => {
    track("upgrade_modal_shown", { trigger });
    // Mark as shown this session
    try {
      sessionStorage.setItem(`upgrade_modal_shown_${trigger}`, "1");
    } catch {
      // sessionStorage may be unavailable
    }
  }, [trigger]);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => setStripeConfigured(d.stripeConfigured ?? true))
      .catch(() => {/* keep optimistic default */});
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleViewPlans() {
    track("upgrade_modal_view_plans_clicked", { trigger });
    onClose();
  }

  function handleDismiss() {
    track("upgrade_modal_dismissed", { trigger });
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={handleDismiss}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Header */}
          <div className="relative bg-gradient-to-br from-violet-600 to-purple-700 px-6 py-8 text-center">
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/20 mb-3">
              <SparklesIcon className="w-6 h-6 text-white" />
            </div>
            <h2
              id="upgrade-modal-title"
              className="text-xl font-bold text-white mb-1"
            >
              {title}
            </h2>
            <p className="text-sm text-white/80">{body}</p>
          </div>

          {stripeConfigured ? (
            <>
              {/* Plan highlights */}
              <div className="px-6 py-5">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
                  Annual billing — save 20%
                </p>
                <div className="space-y-2">
                  {PLAN_HIGHLIGHTS.map((plan) => (
                    <div
                      key={plan.tier}
                      className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                        plan.highlight
                          ? "bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800"
                          : "bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {plan.highlight && <BoltIcon className="w-4 h-4 text-violet-500" />}
                        <span
                          className={`text-sm font-semibold ${
                            plan.highlight
                              ? "text-violet-700 dark:text-violet-300"
                              : "text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {plan.tier}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {plan.price}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {plan.credits}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 flex flex-col gap-3">
                <Link
                  href="/pricing"
                  onClick={handleViewPlans}
                  className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-center bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                >
                  View all plans
                </Link>
                <button
                  onClick={handleDismiss}
                  className="w-full py-2.5 px-4 rounded-xl text-sm font-medium text-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Coming soon state */}
              <div className="px-6 py-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-3">
                  <ClockIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  Subscriptions coming soon
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Paid plans are not yet available. Check back shortly — we&apos;re working on it.
                </p>
              </div>

              <div className="px-6 pb-6">
                <button
                  onClick={handleDismiss}
                  className="w-full py-2.5 px-4 rounded-xl text-sm font-medium text-center bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Got it
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Returns true if the upgrade modal for `trigger` has NOT been shown this session.
 * Call this before showing the modal to prevent session spam.
 */
export function shouldShowUpgradeModal(trigger: UpgradeModalProps["trigger"]): boolean {
  try {
    return !sessionStorage.getItem(`upgrade_modal_shown_${trigger}`);
  } catch {
    return true;
  }
}
