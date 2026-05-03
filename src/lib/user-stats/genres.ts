export type GenreCount = { genre: string; count: number };

export function breakdownGenres(
  songsWithTags: Array<{ tags: string | null }>
): GenreCount[] {
  const genreCounts: Record<string, number> = {};

  for (const song of songsWithTags) {
    if (!song.tags) continue;
    for (const raw of song.tags.split(",")) {
      const genre = raw.trim().toLowerCase();
      if (genre) genreCounts[genre] = (genreCounts[genre] ?? 0) + 1;
    }
  }

  return Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([genre, count]) => ({ genre, count }));
}
