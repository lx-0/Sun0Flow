import { prisma } from "@/lib/prisma";

export interface TagStat {
  tag: string;
  likes: number;
  dislikes: number;
  total: number;
  likeRatio: number;
}

export interface ComboStat {
  combo: string;
  likes: number;
  dislikes: number;
  total: number;
  likeRatio: number;
}

export interface WeeklyDataPoint {
  week: string;
  likes: number;
  dislikes: number;
}

export interface InsightsResult {
  totalLikes: number;
  totalDislikes: number;
  tagBreakdown: TagStat[];
  topCombos: ComboStat[];
  weeklyTrend: WeeklyDataPoint[];
}

interface FeedbackRow {
  rating: string;
  song: { tags: string | null };
}

interface WeeklyRawRow {
  week: Date;
  likes: bigint;
  dislikes: bigint;
}

export async function getInsights(userId: string): Promise<InsightsResult> {
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 12 * 7);

  const [totalLikes, totalDislikes, feedbackWithTags, weeklyRaw] =
    await Promise.all([
      prisma.generationFeedback.count({
        where: { userId, rating: "thumbs_up" },
      }),
      prisma.generationFeedback.count({
        where: { userId, rating: "thumbs_down" },
      }),
      prisma.generationFeedback.findMany({
        where: { userId },
        select: {
          rating: true,
          song: { select: { tags: true } },
        },
      }),
      prisma.$queryRaw<WeeklyRawRow[]>`
        SELECT
          DATE_TRUNC('week', "createdAt") AS week,
          COUNT(*) FILTER (WHERE rating = 'thumbs_up') AS likes,
          COUNT(*) FILTER (WHERE rating = 'thumbs_down') AS dislikes
        FROM "GenerationFeedback"
        WHERE "userId" = ${userId}
          AND "createdAt" >= ${twelveWeeksAgo}
        GROUP BY week
        ORDER BY week ASC
      `,
    ]);

  return {
    totalLikes,
    totalDislikes,
    tagBreakdown: computeTagBreakdown(feedbackWithTags),
    topCombos: computeComboBreakdown(feedbackWithTags),
    weeklyTrend: buildWeeklyTrend(weeklyRaw),
  };
}

export function computeTagBreakdown(
  feedbackRows: FeedbackRow[],
  limit = 15,
): TagStat[] {
  const stats: Record<string, { likes: number; dislikes: number }> = {};

  for (const fb of feedbackRows) {
    if (!fb.song.tags) continue;
    for (const raw of fb.song.tags.split(",")) {
      const tag = raw.trim().toLowerCase();
      if (!tag) continue;
      if (!stats[tag]) stats[tag] = { likes: 0, dislikes: 0 };
      if (fb.rating === "thumbs_up") stats[tag].likes++;
      else stats[tag].dislikes++;
    }
  }

  return Object.entries(stats)
    .map(([tag, { likes, dislikes }]) => ({
      tag,
      likes,
      dislikes,
      total: likes + dislikes,
      likeRatio: likes + dislikes > 0 ? likes / (likes + dislikes) : 0,
    }))
    .filter(({ total }) => total >= 1)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function computeComboBreakdown(
  feedbackRows: FeedbackRow[],
  limit = 5,
): ComboStat[] {
  const stats: Record<string, { likes: number; dislikes: number }> = {};

  for (const fb of feedbackRows) {
    if (!fb.song.tags) continue;
    const combo = fb.song.tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join(", ");
    if (!combo) continue;
    if (!stats[combo]) stats[combo] = { likes: 0, dislikes: 0 };
    if (fb.rating === "thumbs_up") stats[combo].likes++;
    else stats[combo].dislikes++;
  }

  return Object.entries(stats)
    .map(([combo, { likes, dislikes }]) => ({
      combo,
      likes,
      dislikes,
      total: likes + dislikes,
      likeRatio: likes + dislikes > 0 ? likes / (likes + dislikes) : 0,
    }))
    .filter(({ total }) => total >= 1)
    .sort((a, b) => b.likeRatio - a.likeRatio || b.total - a.total)
    .slice(0, limit);
}

export function buildWeeklyTrend(
  rawRows: WeeklyRawRow[],
  now: Date = new Date(),
  weeks = 12,
): WeeklyDataPoint[] {
  const result: WeeklyDataPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const dayOfWeek = d.getDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    d.setDate(d.getDate() + diffToMon);
    d.setHours(0, 0, 0, 0);
    const weekStr = d.toISOString().slice(0, 10);

    const match = rawRows.find(
      (r) => new Date(r.week).toISOString().slice(0, 10) === weekStr,
    );

    result.push({
      week: weekStr,
      likes: match ? Number(match.likes) : 0,
      dislikes: match ? Number(match.dislikes) : 0,
    });
  }

  return result;
}
