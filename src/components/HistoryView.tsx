"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type SortKey = "newest" | "oldest" | "longest" | "shortest";

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Longest first", value: "longest" },
  { label: "Shortest first", value: "shortest" },
];

function sortSongs(songs: Song[], sortKey: SortKey): Song[] {
  return [...songs].sort((a, b) => {
    switch (sortKey) {
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "longest":
        return (b.duration ?? 0) - (a.duration ?? 0);
      case "shortest":
        return (a.duration ?? 0) - (b.duration ?? 0);
    }
  });
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── History entry row ────────────────────────────────────────────────────────

function toQueueSong(song: Song): QueueSong {
  return {
    id: song.id,
    title: song.title,
    audioUrl: song.audioUrl ?? "",
    imageUrl: song.imageUrl,
    duration: song.duration,
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

export function HistoryView({ songs: initialSongs }: { songs: Song[] }) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function handleRetry(song: Song) {
    if (retryingId) return;
    setRetryingId(song.id);

    try {
      const body = {
        prompt: song.prompt,
        title: song.title || undefined,
        tags: song.tags || undefined,
        makeInstrumental: song.isInstrumental,
      };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

      toast("Retry started! Redirecting to library…", "success");
      setTimeout(() => router.push("/library"), 1500);
    } catch {
      toast("Network error. Please check your connection.", "error");
    } finally {
      setRetryingId(null);
    }
  }

  // Filter then sort
  const filteredSongs = (() => {
    const filtered = activeFilter === "all"
      ? initialSongs
      : initialSongs.filter((s) => s.generationStatus === activeFilter);
    return sortSongs(filtered, sortKey);
  })();

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredSongs.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const paginatedSongs = filteredSongs.slice(0, clampedPage * PAGE_SIZE);
  const hasMore = clampedPage < totalPages;

  // Counts for filter chips
  const counts: Record<string, number> = {
    all: initialSongs.length,
    ready: initialSongs.filter((s) => s.generationStatus === "ready").length,
    pending: initialSongs.filter((s) => s.generationStatus === "pending").length,
    failed: initialSongs.filter((s) => s.generationStatus === "failed").length,
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">History</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
          {initialSongs.length} generation{initialSongs.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Filter chips + sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
          {STATUS_FILTERS.map((opt) => {
            const count = counts[opt.value];
            return (
              <button
                key={opt.value}
                onClick={() => { setActiveFilter(opt.value); setPage(1); }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[44px] ${
                  activeFilter === opt.value
                    ? "bg-violet-600 text-white"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {opt.label}{count > 0 ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>

        {/* Sort dropdown */}
        <div className="relative flex-shrink-0">
          <select
            value={sortKey}
            onChange={(e) => { setSortKey(e.target.value as SortKey); setPage(1); }}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-full text-sm font-medium bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-none cursor-pointer min-h-[44px] focus:ring-2 focus:ring-violet-500 focus:outline-none"
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
      {paginatedSongs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center space-y-3">
          <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto" />
          <p className="text-gray-500 text-sm">
            {initialSongs.length === 0
              ? "No generation history yet. Create your first song!"
              : "No generations match this filter."}
          </p>
          {initialSongs.length === 0 && (
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
            {paginatedSongs.map((song) => (
              <HistoryRow key={song.id} song={song} onRetry={handleRetry} retryingId={retryingId} />
            ))}
          </ul>

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="w-full py-3 rounded-xl bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors min-h-[44px]"
            >
              Load more ({filteredSongs.length - paginatedSongs.length} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
}
