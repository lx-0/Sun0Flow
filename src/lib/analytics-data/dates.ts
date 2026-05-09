export function dateRangeStart(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseDateRange(range: string): Date {
  const now = new Date();
  switch (range) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "all":
      return new Date(0);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export function fillDailySeries(
  raw: Array<{ date: string; count: bigint }>,
  days: number,
): Array<{ date: string; count: number }> {
  const now = new Date();
  const map = new Map(
    raw.map((r) => [r.date.toString().slice(0, 10), Number(r.count)]),
  );
  const result: Array<{ date: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map.get(key) ?? 0 });
  }
  return result;
}

export function mondayOfWeeksAgo(weeksAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  const dayOfWeek = d.getDay();
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMon);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function countGenres(
  songs: Array<{ tags: string | null }>,
  limit: number = 12,
): Array<{ genre: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const song of songs) {
    if (!song.tags) continue;
    for (const raw of song.tags.split(",")) {
      const genre = raw.trim().toLowerCase();
      if (genre) counts[genre] = (counts[genre] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre, count]) => ({ genre, count }));
}
