import { prisma } from "@/lib/prisma";
import { parseDateRange, dateRangeStart, mondayOfWeeksAgo } from "@/lib/date-series";

interface FeedbackStat {
  likes: number;
  dislikes: number;
  total: number;
  plays: number;
  likeRatio: number;
}

export interface PromptQualityAnalysis {
  range: string;
  tagBreakdown: Array<{ tag: string } & FeedbackStat>;
  topCombos: Array<{ combo: string } & FeedbackStat>;
  bottomCombos: Array<{ combo: string } & FeedbackStat>;
  qualityTrend: Array<{ week: string; likes: number; dislikes: number; score: number }>;
}

function buildFeedbackStat(likes: number, dislikes: number, plays: number): FeedbackStat {
  const total = likes + dislikes;
  return { likes, dislikes, total, plays, likeRatio: total > 0 ? likes / total : 0 };
}

export async function getPromptQuality(range: string): Promise<PromptQualityAnalysis> {
  const sinceDate = parseDateRange(range);

  const feedbackWithTags = await prisma.generationFeedback.findMany({
    where: { createdAt: { gte: sinceDate } },
    select: {
      rating: true,
      createdAt: true,
      song: { select: { tags: true, playCount: true } },
    },
  });

  const tagAccum: Record<string, { likes: number; dislikes: number; plays: number }> = {};
  const comboAccum: Record<string, { likes: number; dislikes: number; plays: number }> = {};

  for (const fb of feedbackWithTags) {
    const rawTags = fb.song.tags;
    if (!rawTags) continue;

    const tags = rawTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tags.length === 0) continue;

    const isLike = fb.rating === "thumbs_up";

    for (const tag of tags) {
      if (!tagAccum[tag]) tagAccum[tag] = { likes: 0, dislikes: 0, plays: 0 };
      if (isLike) tagAccum[tag].likes++;
      else tagAccum[tag].dislikes++;
      tagAccum[tag].plays += fb.song.playCount ?? 0;
    }

    const combo = [...tags].sort().join(", ");
    if (!comboAccum[combo]) comboAccum[combo] = { likes: 0, dislikes: 0, plays: 0 };
    if (isLike) comboAccum[combo].likes++;
    else comboAccum[combo].dislikes++;
    comboAccum[combo].plays += fb.song.playCount ?? 0;
  }

  const tagBreakdown = Object.entries(tagAccum)
    .map(([tag, { likes, dislikes, plays }]) => ({
      tag,
      ...buildFeedbackStat(likes, dislikes, plays),
    }))
    .filter(({ total }) => total >= 1)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  const allCombos = Object.entries(comboAccum)
    .map(([combo, { likes, dislikes, plays }]) => ({
      combo,
      ...buildFeedbackStat(likes, dislikes, plays),
    }))
    .filter(({ total }) => total >= 2);

  const topCombos = [...allCombos]
    .sort((a, b) => b.likeRatio - a.likeRatio || b.total - a.total)
    .slice(0, 10);

  const bottomCombos = [...allCombos]
    .sort((a, b) => a.likeRatio - b.likeRatio || b.total - a.total)
    .slice(0, 10);

  const twelveWeeksAgo = dateRangeStart(84);
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

  const qualityTrend: Array<{ week: string; likes: number; dislikes: number; score: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const weekStr = mondayOfWeeksAgo(i);
    const match = weeklyRaw.find(
      (r) => new Date(r.week).toISOString().slice(0, 10) === weekStr,
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

  return { range, tagBreakdown, topCombos, bottomCombos, qualityTrend };
}
