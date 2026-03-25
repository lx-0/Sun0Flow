"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  MusicalNoteIcon,
  ArrowPathIcon,
  ClockIcon,
  SparklesIcon,
  ChevronUpDownIcon,
  PlayIcon,
  PauseIcon,
} from "@heroicons/react/24/solid";
import { useToast } from "./Toast";
import { useQueue, type QueueSong } from "./QueueContext";
import Image from "next/image";
import type { Song } from "@prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Status filter chips ──────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Ready", value: "ready" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, error }: { status: string; error?: string | null }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 text-xs font-medium">
        <svg
          className="animate-spin h-3 w-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Generating
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-xs font-medium"
        title={error ?? "Generation failed"}
      >
        Failed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/50 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 text-xs font-medium">
      Ready
    </span>
  );
}

// ─── Variation URL builder ──────────────────────────────────────────────────

function buildVariationUrl(song: Song): string {
  const params = new URLSearchParams();
  if (song.title) params.set("title", song.title);
  if (song.tags) params.set("tags", song.tags);
  if (song.prompt) params.set("prompt", song.prompt);
  return `/generate?${params.toString()}`;
}

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortKey = "newest" | "oldest";

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
];

// ─── History entry row ────────────────────────────────────────────────────────

function toQueueSong(song: Song): QueueSong {
  return {
    id: song.id,
    title: song.title,
    audioUrl: song.audioUrl ?? "",
    imageUrl: song.imageUrl,
    duration: song.duration,
    lyrics: song.lyrics,
  };
}

function HistoryRow({ song, onRetry, retryingId }: { song: Song; onRetry: (song: Song) => void; retryingId: string | null }) {
  const isReady = song.generationStatus === "ready";
  const isFailed = song.generationStatus === "failed";
  const isRetrying = retryingId === song.id;
  const { togglePlay, queue, currentIndex, isPlaying } = useQueue();

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;
  const isThisSongPlaying = isPlaying && currentSong?.id === song.id;

  return (
    <li className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-start gap-3 px-3 py-3">
        {/* Cover art with play overlay */}
        <div className="relative flex-shrink-0 w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden flex items-center justify-center group">
          {song.imageUrl ? (
            <Image src={song.imageUrl} alt={song.title ?? "Song"} fill className="object-cover" sizes="48px" loading="lazy" />
          ) : (
            <MusicalNoteIcon className="w-6 h-6 text-gray-400 dark:text-gray-600" />
          )}
          {isReady && song.audioUrl && (
            <button
              onClick={() => togglePlay(toQueueSong(song))}
              aria-label={isThisSongPlaying ? "Pause" : "Play"}
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {isThisSongPlaying ? (
                <PauseIcon className="w-5 h-5 text-white" />
              ) : (
                <PlayIcon className="w-5 h-5 text-white" />
              )}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Title + status */}
          <div className="flex items-center gap-2 flex-wrap">
            {isReady ? (
              <Link
                href={`/library/${song.id}`}
                className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-violet-400 transition-colors"
              >
                {song.title ?? "Untitled"}
              </Link>
            ) : (
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {song.title ?? "Untitled"}
              </span>
            )}
            <StatusBadge status={song.generationStatus} error={song.errorMessage} />
            {song.isInstrumental && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-xs font-medium">
                Instrumental
              </span>
            )}
            {isReady && ((song as Song & { variationCount?: number }).variationCount ?? 0) > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-[10px] font-medium">
                {((song as Song & { variationCount?: number }).variationCount ?? 0) + 1} versions
              </span>
            )}
          </div>

          {/* Prompt */}
          {song.prompt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{song.prompt}</p>
          )}

          {/* Meta row: style, duration, timestamp */}
          <div className="flex items-center gap-3 flex-wrap">
            {song.tags && (
              <span className="text-xs text-gray-500">{song.tags}</span>
            )}
            {song.duration && (
              <span className="text-xs text-gray-400 dark:text-gray-600">{formatTime(song.duration)}</span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-600 flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              {formatDate(song.createdAt)}
            </span>
          </div>

          {/* Error detail */}
          {isFailed && song.errorMessage && (
            <p className="text-xs text-red-400 mt-1">{song.errorMessage}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex-shrink-0 flex items-center gap-1.5">
          {/* Retry button — only for failed generations */}
          {isFailed && (
            <button
              onClick={() => onRetry(song)}
              disabled={isRetrying}
              className="w-11 h-11 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 transition-colors disabled:opacity-50"
              title="Retry with same parameters"
              aria-label="Retry"
            >
              {isRetrying ? (
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <ArrowPathIcon className="w-5 h-5" />
              )}
            </button>
          )}

          {/* Create variation button — for all songs */}
          <Link
            href={buildVariationUrl(song)}
            className="w-11 h-11 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors"
            title="Create variation"
            aria-label="Create variation"
          >
            <SparklesIcon className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </li>
  );
}

// ─── Main HistoryView ─────────────────────────────────────────────────────────

interface HistoryViewProps {
  songs: Song[];
  initialNextCursor?: string | null;
  initialTotal?: number;
}

export function HistoryView({
  songs: initialSongs,
  initialNextCursor = null,
  initialTotal,
}: HistoryViewProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [activeFilter, setActiveFilter] = useState(searchParams.get("status") ?? "all");
  const [sortKey, setSortKey] = useState<SortKey>((searchParams.get("sort") as SortKey) ?? "newest");
  const [songs, setSongs] = useState<Song[]>(initialSongs);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [totalSongs, setTotalSongs] = useState(initialTotal ?? initialSongs.length);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // ─── Build query params for API fetch ─────────────────────────────────────
  function buildParams(cursor?: string): URLSearchParams {
    const params = new URLSearchParams();
    if (activeFilter !== "all") params.set("status", activeFilter);
    params.set("sortBy", sortKey);
    if (cursor) params.set("cursor", cursor);
    return params;
  }

  // ─── Sync filter state → URL ──────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeFilter !== "all") params.set("status", activeFilter);
    if (sortKey !== "newest") params.set("sort", sortKey);
    const qs = params.toString();
    const newUrl = qs ? `${pathname}?${qs}` : pathname;
    router.replace(newUrl, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, sortKey]);

  // ─── Re-fetch when filter/sort changes ────────────────────────────────────
  const [filterVersion, setFilterVersion] = useState(0);

  useEffect(() => {
    // Skip the initial render — we already have server-side data
    if (filterVersion === 0) return;

    let cancelled = false;
    setLoading(true);
    setNextCursor(null);

    const params = buildParams();

    fetch(`/api/songs?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.songs) {
          setSongs(data.songs);
          setNextCursor(data.nextCursor ?? null);
          setTotalSongs(data.total ?? data.songs.length);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterVersion]);

  function handleFilterChange(filter: string) {
    setActiveFilter(filter);
    setFilterVersion((v) => v + 1);
  }

  function handleSortChange(sort: SortKey) {
    setSortKey(sort);
    setFilterVersion((v) => v + 1);
  }

  // ─── Load more ────────────────────────────────────────────────────────────
  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;

    const params = buildParams(nextCursor);
    setLoadingMore(true);

    fetch(`/api/songs?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.songs) {
          setSongs((prev) => [...prev, ...data.songs]);
          setNextCursor(data.nextCursor ?? null);
          setTotalSongs(data.total ?? totalSongs);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loadingMore, activeFilter, sortKey]);

  // ─── Retry handler ────────────────────────────────────────────────────────
  async function handleRetry(song: Song) {
    if (retryingId) return;
    setRetryingId(song.id);

    try {
      const res = await fetch(`/api/songs/${song.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 && data.resetAt) {
          const resetTime = new Date(data.resetAt);
          const minutesLeft = Math.ceil((resetTime.getTime() - Date.now()) / 60000);
          toast(`Rate limit reached. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`, "error");
        } else {
          toast(data.error ?? "Retry failed. Please try again.", "error");
        }
        return;
      }

      toast("Retry started! Song is regenerating.", "success");
      router.refresh();
    } catch {
      toast("Network error. Please check your connection.", "error");
    } finally {
      setRetryingId(null);
    }
  }

  const remaining = totalSongs - songs.length;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">History</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
          {loading ? "Loading…" : `${songs.length}${remaining > 0 ? ` of ${totalSongs}` : ""} generation${totalSongs !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Filter chips + sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
          {STATUS_FILTERS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleFilterChange(opt.value)}
              disabled={loading}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[44px] disabled:opacity-50 ${
                activeFilter === opt.value
                  ? "bg-violet-600 text-white"
                  : "bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div className="relative flex-shrink-0">
          <select
            value={sortKey}
            onChange={(e) => handleSortChange(e.target.value as SortKey)}
            disabled={loading}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-full text-sm font-medium bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-none cursor-pointer min-h-[44px] focus:ring-2 focus:ring-violet-500 focus:outline-none disabled:opacity-50"
            aria-label="Sort generations"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronUpDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Song list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-6 w-6 text-violet-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : songs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center space-y-3">
          <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto" />
          <p className="text-gray-500 text-sm">
            {activeFilter === "all"
              ? "No generation history yet. Create your first song!"
              : "No generations match this filter."}
          </p>
          {activeFilter === "all" && (
            <Link
              href="/generate"
              className="inline-flex items-center gap-1 text-sm text-violet-400 hover:text-violet-300 transition-colors"
            >
              Go to Generate
            </Link>
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {songs.map((song) => (
              <HistoryRow key={song.id} song={song} onRetry={handleRetry} retryingId={retryingId} />
            ))}
          </ul>

          {/* Load more */}
          {nextCursor && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full py-3 rounded-xl bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors min-h-[44px] disabled:opacity-50"
            >
              {loadingMore ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading…
                </span>
              ) : (
                `Load more (${remaining} remaining)`
              )}
            </button>
          )}

          {/* End of list indicator */}
          {!nextCursor && songs.length > 0 && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-600 py-2">
              All generations loaded
            </p>
          )}
        </>
      )}
    </div>
  );
}
