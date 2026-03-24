"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  PlayIcon,
  PauseIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/solid";

interface DiscoverSong {
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
  user: { name: string | null };
}

interface Pagination {
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "highest_rated", label: "Highest Rated" },
  { value: "most_played", label: "Most Played" },
] as const;

const GENRE_TAGS = [
  "Pop", "Rock", "Hip-Hop", "Electronic", "Jazz",
  "Classical", "R&B", "Country", "Lo-Fi", "Ambient",
  "Metal", "Folk", "Indie", "Funk", "Soul",
] as const;

function formatDuration(seconds: number | null): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function DiscoverView() {
  const [songs, setSongs] = useState<DiscoverSong[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    totalPages: 1,
    total: 0,
    hasMore: false,
  });
  const [sortBy, setSortBy] = useState("newest");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchSongs = useCallback(
    async (page: number, sort: string, genre: string, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), sortBy: sort });
        if (genre) params.set("tag", genre);
        const res = await fetch(`/api/songs/discover?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setSongs((prev) => append ? [...prev, ...data.songs] : data.songs);
        setPagination(data.pagination);
      } catch {
        // keep existing state
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setSongs([]);
    fetchSongs(1, sortBy, tag);
  }, [sortBy, tag, fetchSongs]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !pagination.hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchSongs(pagination.page + 1, sortBy, tag, true);
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [pagination.hasMore, pagination.page, loadingMore, sortBy, tag, fetchSongs]);

  const handlePlayToggle = useCallback(
    (song: DiscoverSong) => {
      if (playingSongId === song.id) {
        audioRef.current?.pause();
        setPlayingSongId(null);
        return;
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (!song.audioUrl) return;
      const audio = new Audio(song.audioUrl);
      audio.volume = 0.7;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingSongId(null);
      audioRef.current = audio;
      setPlayingSongId(song.id);
    },
    [playingSongId]
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/"
                className="text-violet-500 font-bold text-lg tracking-tight"
              >
                SunoFlow
              </Link>
              <h1 className="text-xl font-bold mt-1">Discover</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Explore {pagination.total} publicly shared songs
              </p>
            </div>
            <Link
              href="/auth/signin"
              className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Sort + Filter controls */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Sort */}
          <div className="flex items-center gap-2">
            <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Sort:
            </span>
            <div className="flex gap-1">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSortBy(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors min-h-[44px] ${
                    sortBy === opt.value
                      ? "bg-violet-100 dark:bg-violet-900/50 border-violet-400 dark:border-violet-600 text-violet-700 dark:text-violet-300"
                      : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Genre tags */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTag("")}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors min-h-[44px] ${
              tag === ""
                ? "bg-violet-100 dark:bg-violet-900/50 border-violet-400 dark:border-violet-600 text-violet-700 dark:text-violet-300"
                : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          >
            All Genres
          </button>
          {GENRE_TAGS.map((g) => (
            <button
              key={g}
              onClick={() => setTag(g)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors min-h-[44px] ${
                tag === g
                  ? "bg-violet-100 dark:bg-violet-900/50 border-violet-400 dark:border-violet-600 text-violet-700 dark:text-violet-300"
                  : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Song grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-square bg-gray-200 dark:bg-gray-800" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : songs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No songs found. Try a different filter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {songs.map((song) => (
              <DiscoverCard
                key={song.id}
                song={song}
                isPlaying={playingSongId === song.id}
                onPlayToggle={() => handlePlayToggle(song)}
              />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel + loading indicator */}
        {pagination.hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6" aria-live="polite">
            {loadingMore && (
              <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading more…
              </span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Discover Song Card ─────────────────────────────────────────────────────

function DiscoverCard({
  song,
  isPlaying,
  onPlayToggle,
}: {
  song: DiscoverSong;
  isPlaying: boolean;
  onPlayToggle: () => void;
}) {
  const coverUrl = song.imageUrl || "/default-cover.png";
  const href = song.publicSlug ? `/s/${song.publicSlug}` : "#";

  return (
    <div className="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-shadow hover:shadow-lg hover:shadow-violet-500/10">
      {/* Cover art */}
      <Link href={href} className="block relative aspect-square">
        <Image
          src={coverUrl}
          alt={song.title || "Song cover"}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
          loading="lazy"
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          {song.audioUrl && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPlayToggle();
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-lg min-h-[44px] min-w-[44px]"
              aria-label={isPlaying ? "Pause" : "Play preview"}
            >
              {isPlaying ? (
                <PauseIcon className="w-7 h-7" />
              ) : (
                <PlayIcon className="w-7 h-7 ml-0.5" />
              )}
            </button>
          )}
        </div>
        {/* Duration badge */}
        {song.duration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs font-medium bg-black/70 text-white rounded">
            {formatDuration(song.duration)}
          </span>
        )}
        {/* Playing indicator */}
        {isPlaying && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-violet-600 text-white text-xs font-medium rounded-full">
            <span className="flex gap-0.5">
              <span className="w-0.5 h-3 bg-white rounded-full animate-pulse" />
              <span className="w-0.5 h-2 bg-white rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-0.5 h-3.5 bg-white rounded-full animate-pulse [animation-delay:300ms]" />
            </span>
            Playing
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="p-3">
        <Link href={href}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            {song.title || "Untitled"}
          </h3>
        </Link>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {song.user.name || "Unknown Artist"}
        </p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
            {song.tags || "No genre"}
          </span>
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 shrink-0">
            {song.rating !== null && (
              <span className="flex items-center gap-0.5">
                <span className="text-yellow-500">&#9733;</span>
                {song.rating}
              </span>
            )}
            {song.playCount > 0 && (
              <span>{song.playCount} plays</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
