import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { MILESTONE_META } from "@/lib/streaks";
import { logServerError } from "@/lib/error-logger";

// GET /api/milestones — return current user's earned milestones
export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const rows = await prisma.userMilestone.findMany({
      where: { userId },
      orderBy: { earnedAt: "asc" },
    });

    const milestones = rows.map((m) => ({
      type: m.type,
      earnedAt: m.earnedAt.toISOString(),
      ...(MILESTONE_META[m.type as keyof typeof MILESTONE_META] ?? {
        label: m.type,
        description: "",
        emoji: "🏅",
      }),
    }));

    return NextResponse.json({ milestones });
  } catch (error) {
    logServerError("milestones-get", error, { route: "/api/milestones" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
