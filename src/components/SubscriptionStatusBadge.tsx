"use client";

import { Link } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import { TIER_LABELS, TIER_BADGE_COLORS, type SubscriptionTier } from "@/lib/feature-gates";
import { useCredits } from "@/hooks/useCredits";

interface SubscriptionStatusBadgeProps {
  /** When true, renders a compact single-row layout for mobile */
  compact?: boolean;
}

export function SubscriptionStatusBadge({ compact = false }: SubscriptionStatusBadgeProps) {
  const { data: session } = useSession();
  const { data: credits, loading } = useCredits(!!session?.user);

  if (!session?.user) return null;

  const tier = ((session.user as unknown as Record<string, unknown>).subscriptionTier as SubscriptionTier) ?? "free";
  const isFree = tier === "free";
  const creditsHref = isFree ? "/pricing" : "/settings/billing";

  // Determine credits display state
  const remaining = credits?.creditsRemaining ?? null;
  const isZero = remaining !== null && remaining <= 0;
  const isLow = remaining !== null && remaining > 0 && remaining <= 2;

  const creditsColorClass = isZero
    ? "text-red-600 dark:text-red-400"
    : isLow
    ? "text-amber-600 dark:text-amber-400"
    : "text-gray-600 dark:text-gray-400";

  if (compact) {
    // Compact layout for mobile header — plan badge + credits inline
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href="/settings/billing"
          aria-label={`Current plan: ${TIER_LABELS[tier]}`}
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${TIER_BADGE_COLORS[tier]}`}
        >
          {TIER_LABELS[tier]}
        </Link>
        {!loading && remaining !== null && (
          <Link
            href={creditsHref}
            aria-label={`${remaining} credits remaining`}
            className={`text-[11px] font-medium tabular-nums ${creditsColorClass}`}
          >
            {isZero ? (
              <span className="flex items-center gap-0.5">
                <span>0</span>
                <span className="text-red-500 dark:text-red-400 font-semibold">↑</span>
              </span>
            ) : (
              remaining
            )}
          </Link>
        )}
      </div>
    );
  }

  // Full layout for desktop header
  return (
    <div className="flex items-center gap-2">
      {/* Plan badge */}
      <Link
        href="/settings/billing"
        aria-label={`Current plan: ${TIER_LABELS[tier]}`}
        className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide transition-opacity hover:opacity-80 ${TIER_BADGE_COLORS[tier]}`}
      >
        {TIER_LABELS[tier]}
      </Link>

      {/* Credits count */}
      {!loading && remaining !== null && (
        <Link
          href={creditsHref}
          aria-label={`${remaining} credits remaining`}
          className={`flex items-center gap-1 text-xs font-medium tabular-nums transition-opacity hover:opacity-80 ${creditsColorClass}`}
        >
          <span>{remaining}</span>
          <span className="text-gray-400 dark:text-gray-500 font-normal">cr</span>
          {isZero && (
            <span className="ml-0.5 px-1 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-[10px] font-semibold">
              Upgrade
            </span>
          )}
        </Link>
      )}
    </div>
  );
}
