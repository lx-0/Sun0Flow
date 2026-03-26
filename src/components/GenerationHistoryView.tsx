"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  MagnifyingGlassIcon,
  BookmarkIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolidIcon } from "@heroicons/react/24/solid";
import { useToast } from "./Toast";
import { useQueue, type QueueSong } from "./QueueContext";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenerationEntry {
  id: string;
  title: string | null;
  prompt: string | null;
  tags: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  generationStatus: string;
  errorMessage: string | null;
  isInstrumental: boolean;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

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

const STATUS_FILTERS = [
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
        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
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

// ─── Build generate URL from song params ──────────────────────────────────────

function buildGenerateUrl(entry: GenerationEntry): string {
  const params = new URLSearchParams();
  if (entry.prompt) params.set("prompt", entry.prompt);
  if (entry.title) params.set("title", entry.title);
  if (entry.tags) params.set("tags", entry.tags);
  return `/generate?${params.toString()}`;
}

// ─── Row component ────────────────────────────────────────────────────────────

function GenerationRow({
  entry,
  onRetry,
  retryingId,
  onSavePrompt,
  savingPromptId,
}: {
  entry: GenerationEntry;
  onRetry: (entry: GenerationEntry) => void;
  retryingId: string | null;
  onSavePrompt: (entry: GenerationEntry) => void;
  savingPromptId: string | null;
}) {
  const isReady = entry.generationStatus === "ready";
  const isFailed = entry.generationStatus === "failed";
  const isRetrying = retryingId === entry.id;
  const isSaving = savingPromptId === entry.id;
  const { togglePlay, queue, currentIndex, isPlaying } = useQueue();

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;
  const isThisSongPlaying = isPlaying && currentSong?.id === entry.id;

  const queueSong: QueueSong = {
    id: entry.id,
    title: entry.title,
    audioUrl: entry.audioUrl ?? "",
    imageUrl: entry.imageUrl,
    duration: entry.duration,
    lyrics: null,
  };

  return (
    <li className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-start gap-3 px-3 py-3">
        {/* Cover art with play overlay */}
        <div className="relative flex-shrink-0 w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden flex items-center justify-center group">
          {entry.imageUrl ? (
            <Image src={entry.imageUrl} alt={entry.title ?? "Song"} fill className="object-cover" sizes="48px" loading="lazy" />
          ) : (
            <MusicalNoteIcon className="w-6 h-6 text-gray-400 dark:text-gray-600" />
          )}
          {isReady && entry.audioUrl && (
            <button
              onClick={() => togglePlay(queueSong)}
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
          <div className="flex items-center gap-2 flex-wrap">
            {isReady ? (
              <Link
                href={`/library/${entry.id}`}
                className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-violet-400 transition-colors"
              >
                {entry.title ?? "Untitled"}
              </Link>
            ) : (
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {entry.title ?? "Untitled"}
              </span>
            )}
            <StatusBadge status={entry.generationStatus} error={entry.errorMessage} />
            {entry.isInstrumental && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-xs font-medium">
                Instrumental
              </span>
            )}
            {entry.source === "auto" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                Auto
              </span>
            )}
          </div>

          {entry.prompt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{entry.prompt}</p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {entry.tags && <span className="text-xs text-gray-500">{entry.tags}</span>}
            {entry.duration != null && (
              <span className="text-xs text-gray-400 dark:text-gray-600">{formatTime(entry.duration)}</span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-600 flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              {formatDate(entry.createdAt)}
            </span>
          </div>

          {isFailed && entry.errorMessage && (
            <p className="text-xs text-red-400 mt-1">{entry.errorMessage}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-1.5">
          {/* Save prompt */}
          {entry.prompt && (
            <button
              onClick={() => onSavePrompt(entry)}
              disabled={isSaving}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors disabled:opacity-50"
              title="Save prompt for reuse"
              aria-label="Save prompt"
            >
              {isSaving ? (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <BookmarkIcon className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Retry — only for failed */}
          {isFailed && (
            <button
              onClick={() => onRetry(entry)}
              disabled={isRetrying}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 transition-colors disabled:opacity-50"
              title="Retry with same parameters"
              aria-label="Retry"
            >
              {isRetrying ? (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <ArrowPathIcon className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Regenerate — for all songs (navigate to generate with same params) */}
          <Link
            href={buildGenerateUrl(entry)}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors"
            title={isFailed ? "Create new generation with same prompt" : "Regenerate with same prompt"}
            aria-label="Regenerate"
          >
            <SparklesIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </li>
  );
}

// ─── Saved Prompts section ────────────────────────────────────────────────────

interface Preset {
  id: string;
  name: string;
  stylePrompt: string | null;
  lyricsPrompt: string | null;
  isInstrumental: boolean;
  createdAt: string;
}

function SavedPromptsPanel() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/presets")
      .then((r) => r.json())
      .then((d) => setPresets(d.presets ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await fetch(`/api/presets/${id}`, { method: "DELETE" });
      setPresets((prev) => prev.filter((p) => p.id !== id));
      toast("Prompt deleted", "success");
    } catch {
      toast("Failed to delete prompt", "error");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <svg className="animate-spin h-5 w-5 text-violet-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (presets.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
        No saved prompts yet. Click the <BookmarkIcon className="w-3.5 h-3.5 inline" /> button on any generation to save it.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {presets.map((preset) => (
        <li
          key={preset.id}
          className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2.5"
        >
          <BookmarkSolidIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{preset.name}</p>
            {preset.stylePrompt && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{preset.stylePrompt}</p>
            )}
          </div>
          <Link
            href={`/generate?prompt=${encodeURIComponent(preset.stylePrompt ?? "")}&title=${encodeURIComponent(preset.name)}`}
            className="flex-shrink-0 px-2.5 py-1 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-full transition-colors"
          >
            Use
          </Link>
          <button
            onClick={() => handleDelete(preset.id)}
            disabled={deletingId === preset.id}
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
            aria-label="Delete saved prompt"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortKey = "newest" | "oldest";

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
];

// ─── Main view ────────────────────────────────────────────────────────────────

interface GenerationHistoryViewProps {
  songs: GenerationEntry[];
  initialNextCursor?: string | null;
  initialTotal?: number;
}

export function GenerationHistoryView({
  songs: initialSongs,
  initialNextCursor = null,
  initialTotal,
}: GenerationHistoryViewProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [activeFilter, setActiveFilter] = useState(searchParams.get("status") ?? "all");
  const [sortKey, setSortKey] = useState<SortKey>((searchParams.get("sort") as SortKey) ?? "newest");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get("q") ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("from") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("to") ?? "");

  const [songs, setSongs] = useState<GenerationEntry[]>(initialSongs);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [totalSongs, setTotalSongs] = useState(initialTotal ?? initialSongs.length);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [savingPromptId, setSavingPromptId] = useState<string | null>(null);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [filterVersion, setFilterVersion] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setFilterVersion((v) => v + 1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Sync filter state → URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeFilter !== "all") params.set("status", activeFilter);
    if (sortKey !== "newest") params.set("sort", sortKey);
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, sortKey, debouncedQuery, dateFrom, dateTo]);

  // Build query params
  function buildParams(cursor?: string): URLSearchParams {
    const p = new URLSearchParams();
    if (activeFilter !== "all") p.set("status", activeFilter);
    p.set("sortBy", sortKey);
    if (debouncedQuery) p.set("q", debouncedQuery);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (cursor) p.set("cursor", cursor);
    return p;
  }

  // Re-fetch when filters change
  useEffect(() => {
    if (filterVersion === 0) return;
    let cancelled = false;
    setLoading(true);
    setNextCursor(null);

    fetch(`/api/generations?${buildParams().toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.songs) {
          setSongs(data.songs);
          setNextCursor(data.nextCursor ?? null);
          setTotalSongs(data.total ?? data.songs.length);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterVersion]);

  function handleFilterChange(f: string) { setActiveFilter(f); setFilterVersion((v) => v + 1); }
  function handleSortChange(s: SortKey) { setSortKey(s); setFilterVersion((v) => v + 1); }
  function handleDateChange() { setFilterVersion((v) => v + 1); }

  // Load more
  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    fetch(`/api/generations?${buildParams(nextCursor).toString()}`)
      .then((r) => r.json())
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
  }, [nextCursor, loadingMore, activeFilter, sortKey, debouncedQuery, dateFrom, dateTo]);

  // Retry failed
  async function handleRetry(entry: GenerationEntry) {
    if (retryingId) return;
    setRetryingId(entry.id);
    try {
      const res = await fetch(`/api/songs/${entry.id}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && data.resetAt) {
          const mins = Math.ceil((new Date(data.resetAt).getTime() - Date.now()) / 60000);
          toast(`Rate limit reached. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`, "error");
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

  // Save prompt as preset
  async function handleSavePrompt(entry: GenerationEntry) {
    if (savingPromptId || !entry.prompt) return;
    setSavingPromptId(entry.id);
    try {
      const name = entry.title || entry.prompt.slice(0, 40) + (entry.prompt.length > 40 ? "…" : "");
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, stylePrompt: entry.prompt, isInstrumental: entry.isInstrumental }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error ?? "Could not save prompt.", "error");
        return;
      }
      toast("Prompt saved to library!", "success");
    } catch {
      toast("Network error saving prompt.", "error");
    } finally {
      setSavingPromptId(null);
    }
  }

  const remaining = totalSongs - songs.length;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Generation History</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            {loading ? "Loading…" : `${songs.length}${remaining > 0 ? ` of ${totalSongs}` : ""} generation${totalSongs !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setShowSavedPrompts((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px] ${
            showSavedPrompts
              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
              : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <BookmarkSolidIcon className="w-4 h-4" />
          Saved Prompts
        </button>
      </div>

      {/* Saved prompts panel */}
      {showSavedPrompts && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Saved Prompts</h2>
          <SavedPromptsPanel />
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by prompt…"
          className="w-full pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Date range */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); handleDateChange(); }}
            className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); handleDateChange(); }}
            className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        {(dateFrom || dateTo) && (
          <div className="flex items-end pb-0.5">
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); setFilterVersion((v) => v + 1); }}
              className="px-3 py-1.5 rounded-xl text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-800 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Status chips + sort */}
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

      {/* List */}
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
            {activeFilter !== "all" || debouncedQuery || dateFrom || dateTo
              ? "No generations match these filters."
              : "No generation history yet. Create your first song!"}
          </p>
          {activeFilter === "all" && !debouncedQuery && !dateFrom && !dateTo && (
            <Link href="/generate" className="inline-flex items-center gap-1 text-sm text-violet-400 hover:text-violet-300 transition-colors">
              Go to Generate
            </Link>
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {songs.map((entry) => (
              <GenerationRow
                key={entry.id}
                entry={entry}
                onRetry={handleRetry}
                retryingId={retryingId}
                onSavePrompt={handleSavePrompt}
                savingPromptId={savingPromptId}
              />
            ))}
          </ul>

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

          {!nextCursor && songs.length > 0 && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-600 py-2">All generations loaded</p>
          )}
        </>
      )}
    </div>
  );
}
