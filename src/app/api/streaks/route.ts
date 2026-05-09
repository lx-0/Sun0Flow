import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const GET = authRoute(async (_request, { auth }) => {
  const streak = await prisma.userStreak.findUnique({ where: { userId: auth.userId } });

  return NextResponse.json({
    streak: streak
      ? {
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastActiveDate: streak.lastActiveDate,
        }
      : { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  });
}, { route: "/api/streaks" });
