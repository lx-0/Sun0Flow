import { prisma } from "@/lib/prisma";
import { computeTagBreakdown } from "./tag-breakdown";
import { computeComboBreakdown } from "./combo-breakdown";
import { buildWeeklyTrend, type WeeklyRawRow } from "./weekly-trend";

export type { TagStat } from "./tag-breakdown";
export type { ComboStat } from "./combo-breakdown";
export type { WeeklyDataPoint } from "./weekly-trend";
export { computeTagBreakdown } from "./tag-breakdown";
export { computeComboBreakdown } from "./combo-breakdown";
export { buildWeeklyTrend } from "./weekly-trend";

export interface InsightsResult {
  totalLikes: number;
  totalDislikes: number;
  tagBreakdown: ReturnType<typeof computeTagBreakdown>;
  topCombos: ReturnType<typeof computeComboBreakdown>;
  weeklyTrend: ReturnType<typeof buildWeeklyTrend>;
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
