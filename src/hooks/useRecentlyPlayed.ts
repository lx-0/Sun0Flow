"use client";

import { useQuery } from "@tanstack/react-query";
import { HttpError } from "@/components/QueryProvider";

export interface RecentSong {
  id: string;
  title: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  lyrics: string | null;
  generationStatus: string;
}

export interface HistoryItem {
  id: string;
  songId: string;
  playedAt: string;
  song: RecentSong;
}

export const recentlyPlayedQueryKey = (limit: number) => ["recently-played", limit] as const;

async function fetchRecentlyPlayed(limit: number): Promise<HistoryItem[]> {
  const res = await fetch(`/api/history?limit=${limit}`);
  if (!res.ok) throw new HttpError(res.status);
  const data = await res.json();
  return data.items ?? [];
}

export function useRecentlyPlayed(limit = 20, enabled = true) {
  return useQuery({
    queryKey: recentlyPlayedQueryKey(limit),
    queryFn: () => fetchRecentlyPlayed(limit),
    enabled,
    staleTime: 60_000,
  });
}
