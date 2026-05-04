import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { DEFAULT_MONTHLY_BUDGET } from "./constants";
import type { MonthlyCreditUsage } from "./status";

export async function shouldNotifyLowCredits(
  userId: string,
  usage: MonthlyCreditUsage
): Promise<boolean> {
  if (!usage.isLow) return false;

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "low_credits",
      createdAt: { gte: startOfMonth },
    },
  });

  return !existing;
}

export async function createLowCreditNotification(
  userId: string,
  creditsRemaining: number,
  budget: number = DEFAULT_MONTHLY_BUDGET
) {
  return createNotification({
    userId,
    type: "low_credits",
    title: "Low Credits Warning",
    message: `You have approximately ${creditsRemaining} credits remaining this month (out of ${budget}). Consider reducing usage to avoid running out.`,
    href: "/analytics",
  });
}
