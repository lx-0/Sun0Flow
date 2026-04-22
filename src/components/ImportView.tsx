"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  CheckIcon,
  ArrowPathIcon,
  MusicalNoteIcon,
  CloudArrowDownIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/solid";
import { Skeleton } from "./Skeleton";
import { useNotifications } from "./NotificationContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RemoteSong {
  id: string;
  title: string;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  tags: string | null;
  prompt: string | null;
  lyrics: string | null;
  model: string | null;
  createdAt: string;
  status: string;
  alreadyImported: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface ImportResult {
  imported: Array<{ sunoId: string; localId: string }>;
  skipped: Array<{ sunoId: string; reason: string }>;
  errors: Array<{ id: string; error: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds || isNaN(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Song card skeleton ───────────────────────────────────────────────────────

function ImportSongSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <Skeleton className="aspect-square w-full" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-3 w-1/2 rounded" />
        <Skeleton className="h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}

// ─── Song card ────────────────────────────────────────────────────────────────

interface SongCardProps {
  song: RemoteSong;
  selected: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
}

function SongCard({ song, selected, expanded, onToggle, onExpand }: SongCardProps) {
  const isSelectable = !song.alreadyImported;

  return (
    <div
      className={`relative bg-white dark:bg-gray-900 border rounded-xl overflow-hidden transition-all ${
        isSelectable
          ? "cursor-pointer hover:shadow-md hover:border-violet-400 dark:hover:border-violet-500"
          : "opacity-70 cursor-default"
      } ${
        selected
          ? "border-violet-500 ring-2 ring-violet-400 dark:ring-violet-500"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      {/* Clickable area for selection */}
      <div
        role={isSelectable ? "checkbox" : undefined}
        aria-checked={isSelectable ? selected : undefined}
        aria-label={isSelectable ? `Select ${song.title || "Untitled"}` : undefined}
        tabIndex={isSelectable ? 0 : undefined}
        onClick={() => isSelectable && onToggle(song.id)}
        onKeyDown={(e) => {
          if (isSelectable && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            onToggle(song.id);
          }
        }}
      >
        {/* Cover art */}
        <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
          {song.imageUrl ? (
            <Image
              src={song.imageUrl}
              alt={song.title || "Song cover"}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-600" />
            </div>
          )}

          {/* Selection overlay */}
          {isSelectable && selected && (
            <div className="absolute inset-0 bg-violet-600/20 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center shadow-lg">
                <CheckIcon className="w-5 h-5 text-white" />
              </div>
            </div>
          )}

          {/* Duration badge */}
          {song.duration && (
            <span className="absolute bottom-1.5 right-1.5 text-xs text-white bg-black/60 rounded px-1 py-0.5 leading-none">
              {formatDuration(song.duration)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="p-2.5 space-y-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate leading-snug">
            {song.title || "Untitled"}
          </p>
          {song.tags && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{song.tags}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatDate(song.createdAt)}
            </span>
            {song.alreadyImported && (
              <span className="inline-block text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded-full px-2 py-0.5 leading-none">
                In library
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expand button for details */}
      {(song.prompt || song.lyrics || song.model) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExpand(song.id);
          }}
          className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 border-t border-gray-100 dark:border-gray-800 transition-colors"
        >
          {expanded ? (
            <>
              Less <ChevronUpIcon className="w-3 h-3" />
            </>
          ) : (
            <>
              Details <ChevronDownIcon className="w-3 h-3" />
            </>
          )}
        </button>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-2">
          {song.model && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              <span className="font-medium text-gray-500 dark:text-gray-400">Model:</span> {song.model}
            </p>
          )}
          {song.prompt && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Prompt</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">{song.prompt}</p>
            </div>
          )}
          {song.lyrics && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Lyrics</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-4 whitespace-pre-line">
                {song.lyrics}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ImportView() {
  const { addNotification } = useNotifications();

  const [songs, setSongs] = useState<RemoteSong[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<{
    type: "no_key" | "suno" | "network";
    message?: string;
  } | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // ── Fetch songs ────────────────────────────────────────────────────────────

  const fetchSongs = useCallback(async (page: number) => {
    const isFirst = page === 1;
    if (isFirst) setLoadingInitial(true);
    else setLoadingMore(true);
    setFetchError(null);

    try {
      const res = await fetch(`/api/suno/songs?page=${page}&limit=20`);
      if (res.status === 400) {
        setFetchError({ type: "no_key" });
        return;
      }
      if (res.status === 401) {
        setFetchError({
          type: "suno",
          message: "Invalid Suno API key. Please check your settings.",
        });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const rawMsg = (data as { error?: string }).error;
        setFetchError({
          type: "suno",
          message:
            rawMsg && rawMsg !== "No message available"
              ? rawMsg
              : "Unable to load songs from Suno. Please verify your API key is valid and try again.",
        });
        return;
      }
      const data = (await res.json()) as { songs: RemoteSong[]; pagination: Pagination };
      setSongs((prev) => (isFirst ? data.songs : [...prev, ...data.songs]));
      setPagination(data.pagination);
    } catch {
      setFetchError({
        type: "network",
        message: "Network error. Please check your connection and try again.",
      });
    } finally {
      if (isFirst) setLoadingInitial(false);
      else setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchSongs(1);
  }, [fetchSongs]);

  // ── Selection helpers ──────────────────────────────────────────────────────

  const selectableSongs = songs.filter((s) => !s.alreadyImported);
  const allImported = songs.length > 0 && selectableSongs.length === 0 && !pagination?.hasMore;

  function toggleSong(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedIds.size === selectableSongs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableSongs.map((s) => s.id)));
    }
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (selectedIds.size === 0 || importing) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/suno/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songIds: Array.from(selectedIds) }),
      });
      const data = (await res.json()) as ImportResult;
      setImportResult(data);

      const importedIds = new Set(data.imported.map((r) => r.sunoId));
      setSongs((prev) =>
        prev.map((s) => (importedIds.has(s.id) ? { ...s, alreadyImported: true } : s))
      );
      setSelectedIds(new Set());

      if (data.imported.length > 0) {
        addNotification({
          type: "import_complete",
          title: "Import complete",
          message: `Imported ${data.imported.length} song${data.imported.length !== 1 ? "s" : ""} successfully`,
          href: "/library",
        });
      }
    } catch {
      setImportResult({
        imported: [],
        skipped: [],
        errors: [{ id: "request", error: "Network error. Please try again." }],
      });
    } finally {
      setImporting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const nextPage = pagination ? pagination.page + 1 : 1;
  const hasMore = pagination?.hasMore ?? false;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Import from Suno</h1>
          {pagination && !loadingInitial && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {pagination.total} song{pagination.total !== 1 ? "s" : ""} in your Suno account
            </p>
          )}
        </div>

        {/* Action bar */}
        {!loadingInitial && !fetchError && songs.length > 0 && !allImported && (
          <div className="flex items-center gap-3">
            {selectableSongs.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors"
              >
                {selectedIds.size === selectableSongs.length ? "Deselect all" : "Select all"}
              </button>
            )}
            {selectedIds.size > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {selectedIds.size} selected
              </span>
            )}
            <button
              onClick={handleImport}
              disabled={selectedIds.size === 0 || importing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-500 text-white"
            >
              {importing ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <CloudArrowDownIcon className="w-4 h-4" />
                  {selectedIds.size > 0
                    ? `Import selected (${selectedIds.size})`
                    : "Import selected"}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className="mb-6 text-sm rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-1">
          {importResult.imported.length > 0 && (
            <p className="text-green-700 dark:text-green-400 flex items-center gap-1.5">
              <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
              Imported {importResult.imported.length} song
              {importResult.imported.length !== 1 ? "s" : ""} —{" "}
              <Link
                href="/library"
                className="underline hover:text-green-600 dark:hover:text-green-300"
              >
                View in library
              </Link>
            </p>
          )}
          {importResult.skipped.length > 0 && (
            <p className="text-gray-500 dark:text-gray-400">
              Skipped {importResult.skipped.length} (already in library)
            </p>
          )}
          {importResult.errors.length > 0 && (
            <p className="text-red-600 dark:text-red-400">
              {importResult.errors.length} error{importResult.errors.length !== 1 ? "s" : ""} —{" "}
              {importResult.errors[0].error}
            </p>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loadingInitial && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ImportSongSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error: no API key */}
      {!loadingInitial && fetchError?.type === "no_key" && (
        <div className="text-center py-20 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto">
            <Cog6ToothIcon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              No Suno API key configured
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              To import songs from your Suno account, add your personal API key in Settings.
              You can get a key from{" "}
              <a
                href="https://sunoapi.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 dark:text-violet-400 underline hover:text-violet-500"
              >
                sunoapi.org
              </a>
              .
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            <Cog6ToothIcon className="w-4 h-4" />
            Go to Settings
          </Link>
        </div>
      )}

      {/* Error: Suno API or network */}
      {!loadingInitial && fetchError && fetchError.type !== "no_key" && (
        <div className="text-center py-20 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto">
            <ArrowPathIcon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {fetchError.message ?? "Failed to load songs"}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This may be a temporary issue with the Suno API, or your API key may need to be
              updated in{" "}
              <Link
                href="/settings"
                className="text-violet-600 dark:text-violet-400 underline hover:text-violet-500"
              >
                Settings
              </Link>
              .
            </p>
          </div>
          <button
            onClick={() => fetchSongs(1)}
            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state: no songs */}
      {!loadingInitial && !fetchError && songs.length === 0 && (
        <div className="text-center py-20 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto">
            <MusicalNoteIcon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              No songs found in your Suno account
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Generate songs on suno.com and they&apos;ll appear here for import.
            </p>
          </div>
        </div>
      )}

      {/* Empty state: all imported */}
      {!loadingInitial && !fetchError && allImported && (
        <div className="text-center py-20 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
            <CheckCircleIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              All songs have been imported
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Every song from your Suno account is already in your library.
            </p>
          </div>
          <Link
            href="/library"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            Go to Library
          </Link>
        </div>
      )}

      {/* Song grid */}
      {!loadingInitial && !fetchError && songs.length > 0 && !allImported && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {songs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                selected={selectedIds.has(song.id)}
                expanded={expandedIds.has(song.id)}
                onToggle={toggleSong}
                onExpand={toggleExpand}
              />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => fetchSongs(nextPage)}
                disabled={loadingMore}
                className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Loading…
                  </span>
                ) : (
                  `Load more (${songs.length} of ${pagination?.total ?? "?"})`
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
