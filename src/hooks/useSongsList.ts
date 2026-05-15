"use client";

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import type { Song } from "@prisma/client";
import { HttpError } from "@/components/QueryProvider";

export interface SongsFilters {
  q?: string;
  status?: string;
  minRating?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  tagIds?: string[];
  smartFilter?: string;
  genre?: string[];
  mood?: string[];
  tempoMin?: string;
  tempoMax?: string;
  includeVariations?: boolean;
  archived?: boolean;
  limit?: number;
}

export interface SongsPage {
  songs: Song[];
  nextCursor: string | null;
  total: number;
}

export const SONGS_LIST_KEY_ROOT = "songs-list" as const;

export function songsListQueryKey(filters: SongsFilters) {
  return [SONGS_LIST_KEY_ROOT, filters] as const;
}

function buildFilterParams(filters: SongsFilters, cursor?: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("limit", String(filters.limit ?? 100));
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.minRating) params.set("minRating", filters.minRating);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.tagIds && filters.tagIds.length > 0) params.set("tagIds", filters.tagIds.join(","));
  if (filters.archived) {
    params.set("archived", "true");
  } else if (filters.smartFilter) {
    params.set("smartFilter", filters.smartFilter);
  }
  if (filters.genre && filters.genre.length > 0) params.set("genre", filters.genre.join(","));
  if (filters.mood && filters.mood.length > 0) params.set("mood", filters.mood.join(","));
  if (filters.tempoMin) params.set("tempoMin", filters.tempoMin);
  if (filters.tempoMax) params.set("tempoMax", filters.tempoMax);
  if (filters.includeVariations) params.set("includeVariations", "true");
  if (cursor) params.set("cursor", cursor);
  return params;
}

async function fetchSongsPage(filters: SongsFilters, cursor?: string): Promise<SongsPage> {
  const res = await fetch(`/api/songs?${buildFilterParams(filters, cursor).toString()}`);
  if (!res.ok) throw new HttpError(res.status);
  const data = await res.json();
  return {
    songs: data.songs ?? [],
    nextCursor: data.nextCursor ?? null,
    total: data.total ?? (data.songs?.length ?? 0),
  };
}

export function useSongsList(
  filters: SongsFilters,
  options?: { enabled?: boolean; pollWhilePending?: boolean }
) {
  const enabled = options?.enabled ?? true;

  return useInfiniteQuery<SongsPage, Error, InfiniteData<SongsPage, string | null>, ReturnType<typeof songsListQueryKey>, string | null>({
    queryKey: songsListQueryKey(filters),
    queryFn: ({ pageParam }) => fetchSongsPage(filters, pageParam ?? undefined),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    refetchInterval: (query) => {
      if (!options?.pollWhilePending) return false;
      const data = query.state.data;
      if (!data) return false;
      const hasPending = data.pages.some((p) => p.songs.some((s) => s.generationStatus === "pending"));
      return hasPending ? 30_000 : false;
    },
  });
}
