export interface FeedbackTally {
  key: string;
  likes: number;
  dislikes: number;
  total: number;
  likeRatio: number;
}

export interface TallyOptions {
  limit?: number;
  minTotal?: number;
  sortBy?: "total" | "likeRatio";
}

export function normalizeTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function comboKey(raw: string): string {
  return normalizeTags(raw).sort().join(", ");
}

export function tallyFeedback(
  rows: ReadonlyArray<{ rating: string; tags: string | null }>,
  extractKeys: (tags: string) => string[],
  options: TallyOptions = {},
): FeedbackTally[] {
  const { limit, minTotal = 1, sortBy = "total" } = options;
  const stats: Record<string, { likes: number; dislikes: number }> = {};

  for (const row of rows) {
    if (!row.tags) continue;
    const keys = extractKeys(row.tags);
    for (const key of keys) {
      if (!key) continue;
      if (!stats[key]) stats[key] = { likes: 0, dislikes: 0 };
      if (row.rating === "thumbs_up") stats[key].likes++;
      else stats[key].dislikes++;
    }
  }

  const sorted = Object.entries(stats)
    .map(([key, { likes, dislikes }]) => {
      const total = likes + dislikes;
      return {
        key,
        likes,
        dislikes,
        total,
        likeRatio: total > 0 ? likes / total : 0,
      };
    })
    .filter(({ total }) => total >= minTotal)
    .sort(
      sortBy === "likeRatio"
        ? (a, b) => b.likeRatio - a.likeRatio || b.total - a.total
        : (a, b) => b.total - a.total,
    );

  return limit !== undefined ? sorted.slice(0, limit) : sorted;
}
