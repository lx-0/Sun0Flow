export interface TagStat {
  tag: string;
  likes: number;
  dislikes: number;
  total: number;
  likeRatio: number;
}

export interface FeedbackRow {
  rating: string;
  song: { tags: string | null };
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
