/**
 * Song ratings — backed by the /api/ratings endpoint.
 * Replaces the old localStorage-only implementation.
 */

export interface SongRating {
  stars: number; // 1–5
  note: string;
}

/**
 * Fetch the current user's rating for a specific song.
 * Returns null if the user hasn't rated the song or if not authenticated.
 */
export async function getRating(songId: string): Promise<SongRating | null> {
  try {
    const res = await fetch(`/api/ratings?songId=${encodeURIComponent(songId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const ratings = data.ratings;
    if (!ratings || ratings.length === 0) return null;
    return { stars: ratings[0].value, note: "" };
  } catch {
    return null;
  }
}

/**
 * Fetch all ratings for the current user.
 * Returns a record keyed by songId.
 */
export async function getRatings(): Promise<Record<string, SongRating>> {
  try {
    const res = await fetch("/api/ratings");
    if (!res.ok) return {};
    const data = await res.json();
    const result: Record<string, SongRating> = {};
    for (const r of data.ratings) {
      result[r.songId] = { stars: r.value, note: "" };
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Create or update a rating for a song.
 */
export async function setRating(songId: string, rating: SongRating): Promise<void> {
  await fetch("/api/ratings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ songId, value: rating.stars }),
  });
}

/**
 * Remove a rating by setting it to the minimum — the API doesn't support DELETE,
 * so this is a no-op placeholder. The old localStorage version deleted the entry;
 * with backend persistence, ratings persist but can be overwritten.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function removeRating(songId: string): Promise<void> {
  // No-op: backend ratings persist. To "clear" a rating,
  // use the PATCH /api/songs/[id]/rating endpoint with stars=0.
}
