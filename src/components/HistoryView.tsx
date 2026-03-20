"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MusicalNoteIcon,
  ArrowPathIcon,
  ClockIcon,
} from "@heroicons/react/24/solid";
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-900/50 border border-violet-700 text-violet-300 text-xs font-medium">
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
        className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-900/50 border border-red-700 text-red-300 text-xs font-medium"
        title={error ?? "Generation failed"}
      >
        Failed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-900/50 border border-green-700 text-green-300 text-xs font-medium">
      Ready
    </span>
  );
}

// ─── Regenerate URL builder ───────────────────────────────────────────────────

function buildRegenerateUrl(song: Song): string {
  const params = new URLSearchParams();
  if (song.title) params.set("title", song.title);
  if (song.tags) params.set("tags", song.tags);
  if (song.prompt) params.set("prompt", song.prompt);
  return `/generate?${params.toString()}`;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── History entry row ────────────────────────────────────────────────────────

function HistoryRow({ song }: { song: Song }) {
  const isReady = song.generationStatus === "ready";

  return (
    <li className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-start gap-3 px-3 py-3">
        {/* Cover art / placeholder */}
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-gray-800 overflow-hidden flex items-center justify-center">
          {song.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={song.imageUrl} alt={song.title ?? "Song"} className="w-full h-full object-cover" />
          ) : (
            <MusicalNoteIcon className="w-6 h-6 text-gray-600" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Title + status */}
          <div className="flex items-center gap-2 flex-wrap">
            {isReady ? (
              <Link
                href={`/library/${song.id}`}
                className="text-sm font-medium text-white truncate hover:text-violet-400 transition-colors"
              >
                {song.title ?? "Untitled"}
              </Link>
            ) : (
              <span className="text-sm font-medium text-white truncate">
                {song.title ?? "Untitled"}
              </span>
            )}
            <StatusBadge status={song.generationStatus} error={song.errorMessage} />
          </div>

          {/* Prompt */}
          {song.prompt && (
            <p className="text-xs text-gray-400 line-clamp-2">{song.prompt}</p>
          )}

          {/* Meta row: style, duration, timestamp */}
          <div className="flex items-center gap-3 flex-wrap">
            {song.tags && (
              <span className="text-xs text-gray-500">{song.tags}</span>
            )}
            {song.duration && (
              <span className="text-xs text-gray-600">{formatTime(song.duration)}</span>
            )}
            <span className="text-xs text-gray-600 flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              {formatDate(song.createdAt)}
            </span>
          </div>

          {/* Error detail */}
          {song.generationStatus === "failed" && song.errorMessage && (
            <p className="text-xs text-red-400 mt-1">{song.errorMessage}</p>
          )}
        </div>

        {/* Regenerate button */}
        <Link
          href={buildRegenerateUrl(song)}
          className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-white transition-colors"
          title="Regenerate with same parameters"
          aria-label="Regenerate"
        >
          <ArrowPathIcon className="w-5 h-5" />
        </Link>
      </div>
    </li>
  );
}

// ─── Main HistoryView ─────────────────────────────────────────────────────────

export function HistoryView({ songs: initialSongs }: { songs: Song[] }) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Filter
  const filteredSongs = (() => {
    if (activeFilter === "all") return initialSongs;
    return initialSongs.filter((s) => s.generationStatus === activeFilter);
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
        <h1 className="text-xl font-bold text-white">History</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {initialSongs.length} generation{initialSongs.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((opt) => {
          const count = counts[opt.value];
          return (
            <button
              key={opt.value}
              onClick={() => { setActiveFilter(opt.value); setPage(1); }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[44px] ${
                activeFilter === opt.value
                  ? "bg-violet-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {opt.label}{count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {/* Song list */}
      {paginatedSongs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-3">
          <MusicalNoteIcon className="w-10 h-10 text-gray-700 mx-auto" />
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
              <HistoryRow key={song.id} song={song} />
            ))}
          </ul>

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors min-h-[44px]"
            >
              Load more ({filteredSongs.length - paginatedSongs.length} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
}
