import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";
import type { TIER_LIMITS } from "./resolve";

type TierLimitsMap = typeof TIER_LIMITS;

export async function notifyTopupCreditsAdded(
  userId: string,
  credits: number,
): Promise<void> {
  try {
    await createNotification({
      userId,
      type: "credit_update",
      title: "Credits added",
      message: `${credits} credits have been added to your account and are ready to use.`,
      href: "/settings/billing",
    });
  } catch (err) {
    logger.error({ err, userId, credits }, "billing-notify: failed to send topup notification");
  }
}

export async function notifyCreditsRefreshed(
  userId: string,
  tier: string,
  tierLimits: TierLimitsMap,
): Promise<void> {
  const credits = tierLimits[tier as keyof TierLimitsMap]?.creditsPerMonth;
  if (!credits) return;

  try {
    await createNotification({
      userId,
      type: "credit_update",
      title: "Credits refreshed",
      message: `Your monthly ${credits.toLocaleString()} credits are ready to use.`,
      href: "/settings/billing",
    });
  } catch (err) {
    logger.error({ err, userId, tier }, "billing-notify: failed to send credits-refreshed notification");
  }
}

export async function notifyPaymentFailed(userId: string): Promise<void> {
  try {
    await createNotification({
      userId,
      type: "payment_failed",
      title: "Payment Failed",
      message:
        "Your latest payment failed. Please update your payment method to keep your subscription active.",
      href: "/settings/billing",
    });
  } catch (err) {
    logger.error({ err, userId }, "billing-notify: failed to send payment-failed notification");
  }
}
