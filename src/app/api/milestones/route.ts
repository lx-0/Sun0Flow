import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { MILESTONE_META } from "@/lib/streaks";

export const GET = authRoute(async (_request, { auth }) => {
  const rows = await prisma.userMilestone.findMany({
    where: { userId: auth.userId },
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
}, { route: "/api/milestones" });
