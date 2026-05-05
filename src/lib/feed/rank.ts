import { parseTags } from "@/lib/tags";

export type TasteProfile = Map<string, number>;

export type FeedReason =
  | "recommended"
  | "followed_artist"
  | "trending"
  | "new_release";

export interface FeedItem {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  rating: number | null;
  playCount: number;
  publicSlug: string | null;
  createdAt: string;
  creatorDisplayName: string;
  creatorUsername: string | null;
  creatorUserId: string;
  reason: FeedReason;
  reasonLabel: string;
}

export type SongRow = {
  id: string;
  userId: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  rating: number | null;
  playCount: number;
  downloadCount: number;
  publicSlug: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; username: string | null };
};

// --- Scoring strategy weights ---
// Each bucket gets a base score that determines its priority band.
// Affinity (tag overlap with taste profile) boosts within and across bands.
const RANK_WEIGHTS = {
  followedArtist: 1000,
  recommended: 800,
  trending: 500,
  newRelease: 100,
  trendingScale: 0.01,
  recommendedAffinityThreshold: 2,
} as const;

const TRENDING_DECAY = 0.1;
const DOWNLOAD_MULTIPLIER = 2;

export function trendingScore(
  playCount: number,
  downloadCount: number,
  createdAt: Date,
): number {
  const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return (playCount + downloadCount * DOWNLOAD_MULTIPLIER) / (1 + ageDays * TRENDING_DECAY);
}

export function affinityScore(
  songTags: string[],
  preferredTags: Map<string, number>,
): number {
  if (preferredTags.size === 0 || songTags.length === 0) return 0;
  let score = 0;
  for (const tag of songTags) {
    score += preferredTags.get(tag) ?? 0;
  }
  return score;
}

export function toFeedItem(
  song: SongRow,
  reason: FeedReason,
  reasonLabel: string,
): FeedItem {
  return {
    id: song.id,
    title: song.title,
    tags: song.tags,
    imageUrl: song.imageUrl,
    audioUrl: song.audioUrl,
    duration: song.duration,
    rating: song.rating,
    playCount: song.playCount,
    publicSlug: song.publicSlug,
    createdAt: song.createdAt.toISOString(),
    creatorDisplayName:
      song.user.name || song.user.username || "Unknown Artist",
    creatorUsername: song.user.username,
    creatorUserId: song.user.id,
    reason,
    reasonLabel,
  };
}

export function rankAnonymousFeed(
  trendingPool: SongRow[],
  newReleases: SongRow[],
): FeedItem[] {
  const scoredTrending = trendingPool
    .map((s) => ({
      ...s,
      _score: trendingScore(s.playCount, s.downloadCount, s.createdAt),
    }))
    .sort((a, b) => b._score - a._score);

  const seen = new Set<string>();
  const merged: FeedItem[] = [];
  const maxLen = Math.max(scoredTrending.length, newReleases.length);
  for (let i = 0; i < maxLen; i++) {
    const t = scoredTrending[i];
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      merged.push(toFeedItem(t, "trending", "Trending"));
    }
    const n = newReleases[i];
    if (n && !seen.has(n.id)) {
      seen.add(n.id);
      merged.push(toFeedItem(n, "new_release", "New Release"));
    }
  }

  return merged;
}

export interface PersonalizedRankInput {
  followedSongs: SongRow[];
  trendingPool: SongRow[];
  newReleases: SongRow[];
  followedNames: Map<string, string>;
  tasteProfile: TasteProfile;
}

export function rankPersonalizedFeed(
  input: PersonalizedRankInput,
): FeedItem[] {
  const { followedSongs, trendingPool, newReleases, followedNames, tasteProfile } = input;
  const hasHistory = tasteProfile.size > 0;

  interface ScoredItem {
    item: FeedItem;
    score: number;
  }

  const seen = new Set<string>();
  const allScored: ScoredItem[] = [];

  for (const song of followedSongs) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    const artistName =
      followedNames.get(song.userId) ?? song.user.name ?? "an artist you follow";
    const taff = affinityScore(parseTags(song.tags), tasteProfile);
    allScored.push({
      item: toFeedItem(song, "followed_artist", `From ${artistName}`),
      score: RANK_WEIGHTS.followedArtist + taff,
    });
  }

  const scoredTrending = trendingPool
    .map((s) => ({
      song: s,
      tScore: trendingScore(s.playCount, s.downloadCount, s.createdAt),
    }))
    .sort((a, b) => b.tScore - a.tScore);

  for (const { song, tScore } of scoredTrending) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    const taff = affinityScore(parseTags(song.tags), tasteProfile);
    allScored.push({
      item: toFeedItem(song, "trending", "Trending"),
      score: RANK_WEIGHTS.trending + tScore * RANK_WEIGHTS.trendingScale + taff,
    });
  }

  for (const song of newReleases) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    const taff = affinityScore(parseTags(song.tags), tasteProfile);
    if (hasHistory && taff > RANK_WEIGHTS.recommendedAffinityThreshold) {
      allScored.push({
        item: toFeedItem(song, "recommended", "Recommended for you"),
        score: RANK_WEIGHTS.recommended + taff,
      });
    } else {
      allScored.push({
        item: toFeedItem(song, "new_release", "New Release"),
        score: RANK_WEIGHTS.newRelease + taff,
      });
    }
  }

  allScored.sort((a, b) => b.score - a.score);

  return allScored.map((s) => s.item);
}
