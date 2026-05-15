import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MILESTONE_META } from "@/lib/streaks";
import { publicRoute } from "@/lib/route-handler";
import { notFound } from "@/lib/api-error";

export const GET = publicRoute<{ username: string }>(async (_request, { params }) => {
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: { id: true },
  });
  if (!user) {
    return notFound("Not found");
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
}, { route: "/api/u/[username]/milestones" });
