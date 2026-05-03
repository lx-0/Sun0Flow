import { parseTags } from "@/lib/tags";
import { trendingScore, affinityScore } from "./score";
import type { TasteProfile } from "./taste-profile";

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
      score: 1000 + taff,
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
      score: 500 + tScore * 0.01 + taff,
    });
  }

  for (const song of newReleases) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    const taff = affinityScore(parseTags(song.tags), tasteProfile);
    if (hasHistory && taff > 2) {
      allScored.push({
        item: toFeedItem(song, "recommended", "Recommended for you"),
        score: 800 + taff,
      });
    } else {
      allScored.push({
        item: toFeedItem(song, "new_release", "New Release"),
        score: 100 + taff,
      });
    }
  }

  allScored.sort((a, b) => b.score - a.score);

  return allScored.map((s) => s.item);
}
