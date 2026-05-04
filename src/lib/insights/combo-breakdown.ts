export interface ComboStat {
  combo: string;
  likes: number;
  dislikes: number;
  total: number;
  likeRatio: number;
}

export interface FeedbackRow {
  rating: string;
  song: { tags: string | null };
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
