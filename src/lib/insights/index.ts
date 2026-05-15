import { prisma } from "@/lib/prisma";
import { mondayOfWeeksAgo } from "@/lib/date-series";
import { tallyFeedback, normalizeTags, comboKey } from "@/lib/feedback-tally";

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
  const flat = feedbackRows.map((fb) => ({ rating: fb.rating, tags: fb.song.tags }));
  return tallyFeedback(flat, normalizeTags, { limit, sortBy: "total" }).map(
    ({ key, ...rest }) => ({ tag: key, ...rest }),
  );
}

export function computeComboBreakdown(
  feedbackRows: FeedbackRow[],
  limit = 5,
): ComboStat[] {
  const flat = feedbackRows.map((fb) => ({ rating: fb.rating, tags: fb.song.tags }));
  return tallyFeedback(flat, (tags) => [comboKey(tags)], {
    limit,
    sortBy: "likeRatio",
  }).map(({ key, ...rest }) => ({ combo: key, ...rest }));
}

export function buildWeeklyTrend(
  rawRows: WeeklyRawRow[],
  now: Date = new Date(),
  weeks = 12,
): WeeklyDataPoint[] {
  const result: WeeklyDataPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStr = mondayOfWeeksAgo(i, now);

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
