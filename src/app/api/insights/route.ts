import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  try {
    const [totalLikes, totalDislikes, feedbackWithTags] = await Promise.all([
      prisma.generationFeedback.count({ where: { userId, rating: "thumbs_up" } }),
      prisma.generationFeedback.count({ where: { userId, rating: "thumbs_down" } }),
      prisma.generationFeedback.findMany({
        where: { userId },
        select: {
          rating: true,
          createdAt: true,
          song: { select: { tags: true } },
        },
      }),
    ]);

    // Tag-level breakdown
    const tagStats: Record<string, { likes: number; dislikes: number }> = {};
    // Combo-level breakdown (full tags string as a combo)
    const comboStats: Record<string, { likes: number; dislikes: number }> = {};

    for (const fb of feedbackWithTags) {
      // Individual tags
      if (fb.song.tags) {
        for (const raw of fb.song.tags.split(",")) {
          const tag = raw.trim().toLowerCase();
          if (!tag) continue;
          if (!tagStats[tag]) tagStats[tag] = { likes: 0, dislikes: 0 };
          if (fb.rating === "thumbs_up") tagStats[tag].likes++;
          else tagStats[tag].dislikes++;
        }

        // Combo (normalize the tags string)
        const combo = fb.song.tags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .sort()
          .join(", ");
        if (combo) {
          if (!comboStats[combo]) comboStats[combo] = { likes: 0, dislikes: 0 };
          if (fb.rating === "thumbs_up") comboStats[combo].likes++;
          else comboStats[combo].dislikes++;
        }
      }
    }

    const tagBreakdown = Object.entries(tagStats)
      .map(([tag, { likes, dislikes }]) => ({
        tag,
        likes,
        dislikes,
        total: likes + dislikes,
        likeRatio: likes + dislikes > 0 ? likes / (likes + dislikes) : 0,
      }))
      .filter(({ total }) => total >= 1)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    const topCombos = Object.entries(comboStats)
      .map(([combo, { likes, dislikes }]) => ({
        combo,
        likes,
        dislikes,
        total: likes + dislikes,
        likeRatio: likes + dislikes > 0 ? likes / (likes + dislikes) : 0,
      }))
      .filter(({ total }) => total >= 1)
      .sort((a, b) => b.likeRatio - a.likeRatio || b.total - a.total)
      .slice(0, 5);

    // Weekly trend: last 12 weeks using raw query
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 12 * 7);

    const weeklyRaw = await prisma.$queryRaw<
      Array<{ week: Date; likes: bigint; dislikes: bigint }>
    >`
      SELECT
        DATE_TRUNC('week', "createdAt") AS week,
        COUNT(*) FILTER (WHERE rating = 'thumbs_up') AS likes,
        COUNT(*) FILTER (WHERE rating = 'thumbs_down') AS dislikes
      FROM "GenerationFeedback"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${twelveWeeksAgo}
      GROUP BY week
      ORDER BY week ASC
    `;

    // Build a 12-week series (Mon-aligned ISO dates)
    const weeklyTrend: Array<{ week: string; likes: number; dislikes: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      // Rewind to Monday
      const dayOfWeek = d.getDay();
      const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      d.setDate(d.getDate() + diffToMon);
      d.setHours(0, 0, 0, 0);
      const weekStr = d.toISOString().slice(0, 10);
      const match = weeklyRaw.find(
        (r) => new Date(r.week).toISOString().slice(0, 10) === weekStr
      );
      weeklyTrend.push({
        week: weekStr,
        likes: match ? Number(match.likes) : 0,
        dislikes: match ? Number(match.dislikes) : 0,
      });
    }

    return NextResponse.json({
      totalLikes,
      totalDislikes,
      tagBreakdown,
      topCombos,
      weeklyTrend,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
