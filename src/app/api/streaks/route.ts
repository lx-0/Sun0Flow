import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";

// GET /api/streaks — return current user's streak data
export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const streak = await prisma.userStreak.findUnique({ where: { userId } });

    return NextResponse.json({
      streak: streak
        ? {
            currentStreak: streak.currentStreak,
            longestStreak: streak.longestStreak,
            lastActiveDate: streak.lastActiveDate,
          }
        : { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
    });
  } catch (error) {
    logServerError("streaks-get", error, { route: "/api/streaks" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
