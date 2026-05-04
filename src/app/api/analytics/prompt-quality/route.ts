import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const searchParams = request.nextUrl.searchParams;
  const range = searchParams.get("range") || "30d";

  const now = new Date();
  let sinceDate: Date;
  switch (range) {
    case "7d":
      sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      sinceDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "all":
      sinceDate = new Date(0);
      break;
    default: // 30d
      sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Fetch all feedback joined with song tags in the date range
  const feedbackWithTags = await prisma.generationFeedback.findMany({
    where: { createdAt: { gte: sinceDate } },
    select: {
      rating: true,
      createdAt: true,
      song: {
        select: {
          tags: true,
          playCount: true,
        },
      },
    },
  });

  // Compute per-tag and per-combo stats
  const tagStats: Record<string, { likes: number; dislikes: number; plays: number }> = {};
  const comboStats: Record<string, { likes: number; dislikes: number; plays: number }> = {};

  for (const fb of feedbackWithTags) {
    const rawTags = fb.song.tags;
    if (!rawTags) continue;

    const tags = rawTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    if (tags.length === 0) continue;

    for (const tag of tags) {
      if (!tagStats[tag]) tagStats[tag] = { likes: 0, dislikes: 0, plays: 0 };
      if (fb.rating === "thumbs_up") tagStats[tag].likes++;
      else tagStats[tag].dislikes++;
      tagStats[tag].plays += fb.song.playCount ?? 0;
    }

    const combo = [...tags].sort().join(", ");
    if (!comboStats[combo]) comboStats[combo] = { likes: 0, dislikes: 0, plays: 0 };
    if (fb.rating === "thumbs_up") comboStats[combo].likes++;
    else comboStats[combo].dislikes++;
    comboStats[combo].plays += fb.song.playCount ?? 0;
  }

  // Build sorted tag breakdown
  const tagBreakdown = Object.entries(tagStats)
    .map(([tag, { likes, dislikes, plays }]) => ({
      tag,
      likes,
      dislikes,
      total: likes + dislikes,
      plays,
      likeRatio: likes + dislikes > 0 ? likes / (likes + dislikes) : 0,
    }))
    .filter(({ total }) => total >= 1)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  // Top 10 and bottom 10 combos (min 2 total feedbacks)
  const allCombos = Object.entries(comboStats)
    .map(([combo, { likes, dislikes, plays }]) => ({
      combo,
      likes,
      dislikes,
      total: likes + dislikes,
      plays,
      likeRatio: likes + dislikes > 0 ? likes / (likes + dislikes) : 0,
    }))
    .filter(({ total }) => total >= 2);

  const topCombos = [...allCombos]
    .sort((a, b) => b.likeRatio - a.likeRatio || b.total - a.total)
    .slice(0, 10);

  const bottomCombos = [...allCombos]
    .sort((a, b) => a.likeRatio - b.likeRatio || b.total - a.total)
    .slice(0, 10);

  // Weekly quality trend (last 12 weeks)
  const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);

  const weeklyRaw = await prisma.$queryRaw<
    Array<{ week: Date; likes: bigint; dislikes: bigint }>
  >`
    SELECT
      DATE_TRUNC('week', "createdAt") AS week,
      COUNT(*) FILTER (WHERE rating = 'thumbs_up') AS likes,
      COUNT(*) FILTER (WHERE rating = 'thumbs_down') AS dislikes
    FROM "GenerationFeedback"
    WHERE "createdAt" >= ${twelveWeeksAgo}
    GROUP BY week
    ORDER BY week ASC
  `;

  // Build 12-week series (Mon-aligned)
  const qualityTrend: Array<{ week: string; likes: number; dislikes: number; score: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const dayOfWeek = d.getDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    d.setDate(d.getDate() + diffToMon);
    d.setHours(0, 0, 0, 0);
    const weekStr = d.toISOString().slice(0, 10);
    const match = weeklyRaw.find(
      (r) => new Date(r.week).toISOString().slice(0, 10) === weekStr
    );
    const likes = match ? Number(match.likes) : 0;
    const dislikes = match ? Number(match.dislikes) : 0;
    const total = likes + dislikes;
    qualityTrend.push({
      week: weekStr,
      likes,
      dislikes,
      score: total > 0 ? Math.round((likes / total) * 100) : 0,
    });
  }

  return NextResponse.json({
    range,
    tagBreakdown,
    topCombos,
    bottomCombos,
    qualityTrend,
  });
}
