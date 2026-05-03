import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { CREDIT_COSTS } from "./constants";

export async function recordCreditUsage(
  userId: string,
  action: string,
  opts?: { songId?: string; creditCost?: number; description?: string }
) {
  const cost = opts?.creditCost ?? CREDIT_COSTS[action] ?? 0;
  const record = await prisma.creditUsage.create({
    data: {
      userId,
      action,
      creditCost: cost,
      songId: opts?.songId,
      description: opts?.description,
    },
  });
  logger.info(
    { userId, action, creditCost: cost, songId: opts?.songId ?? null },
    "credits: usage recorded"
  );
  return record;
}

export interface RawMonthlyUsage {
  monthlyCredits: number;
  monthlyCount: number;
  allTimeCredits: number;
  allTimeCount: number;
  dailyBreakdown: Array<{ date: string; credits: bigint; count: bigint }>;
}

export async function fetchMonthlyUsage(
  userId: string,
  startOfMonth: Date
): Promise<RawMonthlyUsage> {
  const [monthlyUsage, totalAllTime, dailyBreakdown] = await Promise.all([
    prisma.creditUsage.aggregate({
      where: { userId, createdAt: { gte: startOfMonth } },
      _sum: { creditCost: true },
      _count: true,
    }),
    prisma.creditUsage.aggregate({
      where: { userId },
      _sum: { creditCost: true },
      _count: true,
    }),
    prisma.$queryRaw<Array<{ date: string; credits: bigint; count: bigint }>>`
      SELECT DATE("createdAt") as date,
             SUM("creditCost")::bigint as credits,
             COUNT(*)::bigint as count
      FROM "CreditUsage"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${startOfMonth}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
  ]);

  return {
    monthlyCredits: monthlyUsage._sum.creditCost ?? 0,
    monthlyCount: monthlyUsage._count,
    allTimeCredits: totalAllTime._sum.creditCost ?? 0,
    allTimeCount: totalAllTime._count,
    dailyBreakdown,
  };
}
