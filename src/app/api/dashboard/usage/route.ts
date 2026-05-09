import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    // Current rate limit status
    const { status: rateLimitStatus } = await checkRateLimit(userId);

    // Usage history: daily generation counts for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const entries = await prisma.rateLimitEntry.findMany({
      where: {
        userId,
        action: "generate",
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Build daily counts for last 30 days
    const dailyCounts: { date: string; count: number }[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dailyCounts.push({ date: dateStr, count: 0 });
    }

    for (const entry of entries) {
      const dateStr = entry.createdAt.toISOString().slice(0, 10);
      const bucket = dailyCounts.find((d) => d.date === dateStr);
      if (bucket) bucket.count++;
    }

    // Hourly breakdown for today
    const startOfToday = new Date(today);
    startOfToday.setHours(0, 0, 0, 0);

    const todayEntries = entries.filter(
      (e) => e.createdAt >= startOfToday
    );

    const hourlyCounts: { hour: number; count: number }[] = [];
    for (let h = 0; h < 24; h++) {
      hourlyCounts.push({ hour: h, count: 0 });
    }
    for (const entry of todayEntries) {
      const hour = entry.createdAt.getHours();
      hourlyCounts[hour].count++;
    }

    // Summary stats
    const totalAllTime = await prisma.rateLimitEntry.count({
      where: { userId, action: "generate" },
    });

    const totalLast30Days = entries.length;
    const totalToday = todayEntries.length;

    return NextResponse.json({
      rateLimit: rateLimitStatus,
      summary: {
        totalAllTime,
        totalLast30Days,
        totalToday,
      },
      dailyCounts,
      hourlyCounts,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
