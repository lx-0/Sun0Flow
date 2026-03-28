import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MILESTONE_META } from "@/lib/streaks";
import { logServerError } from "@/lib/error-logger";

// GET /api/u/:username/milestones — public milestone list for a user profile
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const rows = await prisma.userMilestone.findMany({
      where: { userId: user.id },
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
    logServerError("public-milestones-get", error, { route: "/api/u/[username]/milestones" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
