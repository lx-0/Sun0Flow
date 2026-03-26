"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  PlayIcon,
  PauseIcon,
  HeartIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  FunnelIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/solid";
import { HeartIcon as HeartOutlineIcon, CloudArrowDownIcon, CheckCircleIcon, QueueListIcon, ForwardIcon } from "@heroicons/react/24/outline";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import type { Song } from "@prisma/client";
import { downloadSongFile } from "@/lib/download";
import { useToast } from "./Toast";
import { useQueue, type QueueSong } from "./QueueContext";
import { PullToRefreshContainer } from "./PullToRefreshContainer";
import { CoverArtImage } from "./CoverArtImage";
import { generateCoverArtVariants } from "@/lib/cover-art-generator";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SongTagRelation {
  tag: { id: string; name: string; color: string };
}

type SongWithMeta = Song & {
  songTags: SongTagRelation[];
  isFavorite: boolean;
  favoriteCount: number;
  variationCount?: number;
};

interface SongsGalleryViewProps {
  initialSongs: SongWithMeta[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Filter chips ────────────────────────────────────────────────────────────

const STYLE_FILTERS = ["Pop", "Rock", "Hip-Hop", "Electronic", "Jazz", "Classical", "R&B", "Country", "Lo-Fi"] as const;
const MOOD_FILTERS = ["Energetic", "Chill", "Dark", "Happy", "Sad", "Dreamy", "Aggressive"] as const;
const DATE_FILTERS = [
  { label: "Today", days: 0 },
  { label: "This week", days: 7 },
  { label: "This month", days: 30 },
  { label: "All time", days: -1 },
] as const;

// ─── Song Card ───────────────────────────────────────────────────────────────

interface SongCardProps {
  song: SongWithMeta;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onFavoriteToggle: () => void;
  onDownload: () => void;
  isCached: boolean;
  isSaving: boolean;
  onSaveOffline: () => void;
  onRemoveOffline: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
}

function SongCard({ song, isPlaying, onPlayToggle, onFavoriteToggle, onDownload, isCached, isSaving, onSaveOffline, onRemoveOffline, onPlayNext, onAddToQueue }: SongCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);
  const hasAudio = !!song.audioUrl;
  const coverUrl = song.imageUrl || generateCoverArtVariants({ songId: song.id, title: song.title, tags: song.tags })[0].dataUrl;

  return (
    <div className="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-shadow hover:shadow-lg hover:shadow-violet-500/10">
      {/* Cover art */}
      <Link href={`/library/${song.id}`} className="block relative aspect-square">
        <CoverArtImage
          src={coverUrl}
          alt={song.title || "Song cover"}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
          loading="lazy"
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          {hasAudio && (
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
        {/* Variation badge */}
        {(song.variationCount ?? 0) > 0 && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-medium bg-violet-600/90 text-white rounded-full">
            {(song.variationCount ?? 0) + 1} versions
          </span>
        )}
        {/* Offline badge */}
        {isCached && (
          <span className="absolute bottom-2 left-2 px-1.5 py-0.5 text-[10px] font-medium bg-green-600/90 text-white rounded-full flex items-center gap-0.5">
            <CheckCircleIcon className="w-2.5 h-2.5" />
            Offline
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

      {/* Info + actions */}
      <div className="p-3">
        <Link href={`/library/${song.id}`}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            {song.title || "Untitled"}
          </h3>
        </Link>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {song.tags || song.prompt?.slice(0, 60) || "No description"}
        </p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatDate(song.createdAt)}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onFavoriteToggle}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={song.isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              {song.isFavorite ? (
                <HeartIcon className="w-4.5 h-4.5 text-red-500" />
              ) : (
                <HeartOutlineIcon className="w-4.5 h-4.5 text-gray-400 hover:text-red-400" />
              )}
            </button>
            {hasAudio && (
              <button
                onClick={onDownload}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Download song"
              >
                <ArrowDownTrayIcon className="w-4.5 h-4.5 text-gray-400 hover:text-violet-500" />
              </button>
            )}
            {hasAudio && (
              <button
                onClick={isCached ? onRemoveOffline : onSaveOffline}
                disabled={isSaving}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
                aria-label={isCached ? "Remove from offline" : "Save for offline playback"}
                title={isCached ? "Remove from offline" : "Save for offline"}
              >
                {isCached ? (
                  <CheckCircleIcon className="w-4.5 h-4.5 text-green-500" />
                ) : (
                  <CloudArrowDownIcon className={`w-4.5 h-4.5 ${isSaving ? "text-violet-400 animate-pulse" : "text-gray-400 hover:text-violet-500"}`} />
                )}
              </button>
            )}
            {hasAudio && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="More options"
                  aria-expanded={menuOpen}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <EllipsisVerticalIcon className="w-4.5 h-4.5 text-gray-400" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 bottom-full mb-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden">
                    <button
                      onClick={() => { onPlayNext(); setMenuOpen(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <ForwardIcon className="w-4 h-4 flex-shrink-0 text-gray-400" />
                      Play Next
                    </button>
                    <button
                      onClick={() => { onAddToQueue(); setMenuOpen(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <QueueListIcon className="w-4 h-4 flex-shrink-0 text-gray-400" />
                      Add to Queue
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Gallery View ───────────────────────────────────────────────────────

export function SongsGalleryView({ initialSongs }: SongsGalleryViewProps) {
  const { toast } = useToast();
  const { cachedIds, saving, saveOffline, removeOffline } = useOfflineCache();
  const { queue, currentIndex, isPlaying: globalIsPlaying, playQueue, togglePlay, addToQueue, playNext } = useQueue();

  // State
  const [songs, setSongs] = useState<SongWithMeta[]>(initialSongs);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStyles, setSelectedStyles] = useState<Set<string>>(new Set());
  const [selectedMoods, setSelectedMoods] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<number>(-1); // days, -1 = all
  const [offlineOnly, setOfflineOnly] = useState(false);

  // Filter songs
  const filtered = useMemo(() => {
    let result = songs;

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          (s.title?.toLowerCase().includes(q)) ||
          (s.prompt?.toLowerCase().includes(q)) ||
          (s.tags?.toLowerCase().includes(q))
      );
    }

    // Style filter — match against tags field
    if (selectedStyles.size > 0) {
      result = result.filter((s) => {
        const t = (s.tags || "").toLowerCase();
        return Array.from(selectedStyles).some((style) => t.includes(style.toLowerCase()));
      });
    }

    // Mood filter — match against tags or prompt
    if (selectedMoods.size > 0) {
      result = result.filter((s) => {
        const text = `${s.tags || ""} ${s.prompt || ""}`.toLowerCase();
        return Array.from(selectedMoods).some((mood) => text.includes(mood.toLowerCase()));
      });
    }

    // Date filter
    if (dateFilter >= 0) {
      const now = Date.now();
      if (dateFilter === 0) {
        // Today
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        result = result.filter((s) => new Date(s.createdAt).getTime() >= start.getTime());
      } else {
        const cutoff = now - dateFilter * 24 * 60 * 60 * 1000;
        result = result.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
      }
    }

    // Offline-only filter
    if (offlineOnly) {
      result = result.filter((s) => cachedIds.has(s.id));
    }

    return result;
  }, [songs, search, selectedStyles, selectedMoods, dateFilter, offlineOnly, cachedIds]);

  // Map a SongWithMeta to the QueueSong shape
  const toQueueSong = useCallback((song: SongWithMeta): QueueSong => ({
    id: song.id,
    title: song.title,
    audioUrl: song.audioUrl!,
    imageUrl: song.imageUrl ?? null,
    duration: song.duration ?? null,
    lyrics: song.lyrics ?? null,
  }), []);

  // Play/pause toggle — uses the global queue
  const handlePlayToggle = useCallback(
    (song: SongWithMeta) => {
      if (!song.audioUrl) {
        toast("Could not play audio", "error");
        return;
      }
      const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;
      if (currentSong?.id === song.id) {
        // Toggle play/pause for the current song
        togglePlay();
        return;
      }
      // Build a play queue from the currently-filtered songs in display order
      const playable = filtered.filter((s) => !!s.audioUrl);
      const idx = playable.findIndex((s) => s.id === song.id);
      if (idx >= 0) {
        playQueue(playable.map(toQueueSong), idx, "Songs");
      }
    },
    [currentIndex, queue, togglePlay, filtered, playQueue, toQueueSong, toast]
  );

  // Play Next
  const handlePlayNext = useCallback(
    (song: SongWithMeta) => {
      if (!song.audioUrl) return;
      playNext(toQueueSong(song));
      toast("Playing next", "success");
    },
    [playNext, toQueueSong, toast]
  );

  // Add to Queue
  const handleAddToQueue = useCallback(
    (song: SongWithMeta) => {
      if (!song.audioUrl) return;
      addToQueue(toQueueSong(song));
      toast("Added to queue", "success");
    },
    [addToQueue, toQueueSong, toast]
  );

  // Favorite toggle
  const handleFavoriteToggle = useCallback(
    async (song: SongWithMeta) => {
      const method = song.isFavorite ? "DELETE" : "POST";
      try {
        const res = await fetch(`/api/songs/${song.id}/favorite`, { method });
        if (!res.ok) throw new Error();
        setSongs((prev) =>
          prev.map((s) =>
            s.id === song.id
              ? {
                  ...s,
                  isFavorite: !s.isFavorite,
                  favoriteCount: s.isFavorite ? s.favoriteCount - 1 : s.favoriteCount + 1,
                }
              : s
          )
        );
        toast(song.isFavorite ? "Removed from favorites" : "Added to favorites", "success");
      } catch {
        toast("Failed to update favorite", "error");
      }
    },
    [toast]
  );

  // Download
  const handleDownload = useCallback(
    async (song: SongWithMeta) => {
      if (!song.audioUrl) return;
      try {
        await downloadSongFile(
          { id: song.id, title: song.title, audioUrl: song.audioUrl },
          () => {}
        );
        toast("Download started", "success");
      } catch {
        toast("Download failed", "error");
      }
    },
    [toast]
  );

  // Toggle helpers
  const toggleStyle = (style: string) => {
    setSelectedStyles((prev) => {
      const next = new Set(prev);
      if (next.has(style)) next.delete(style);
      else next.add(style);
      return next;
    });
  };

  const toggleMood = (mood: string) => {
    setSelectedMoods((prev) => {
      const next = new Set(prev);
      if (next.has(mood)) next.delete(mood);
      else next.add(mood);
      return next;
    });
  };

  // Pull-to-refresh: reload songs from API
  const handlePullRefresh = useCallback(async () => {
    try {
      const res = await fetch("/api/songs");
      if (!res.ok) return;
      const data = await res.json();
      if (data.songs) setSongs(data.songs);
    } catch {
      // keep existing songs
    }
  }, []);

  const activeFilterCount = selectedStyles.size + selectedMoods.size + (dateFilter >= 0 ? 1 : 0) + (offlineOnly ? 1 : 0);

  const clearFilters = () => {
    setSelectedStyles(new Set());
    setSelectedMoods(new Set());
    setDateFilter(-1);
    setOfflineOnly(false);
    setSearch("");
  };

  return (
    <PullToRefreshContainer onRefresh={handlePullRefresh}>
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Songs</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {filtered.length} {filtered.length === 1 ? "song" : "songs"}
        </p>
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search songs..."
            className="w-full pl-9 pr-8 py-2.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all min-h-[44px]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Clear search"
            >
              <XMarkIcon className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-xl border transition-colors min-h-[44px] ${
            showFilters || activeFilterCount > 0
              ? "bg-violet-50 dark:bg-violet-900/30 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300"
              : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
          aria-label="Toggle filters"
        >
          <FunnelIcon className="w-4 h-4" />
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-violet-600 text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-4">
          {/* Style */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Style
            </h3>
            <div className="flex flex-wrap gap-2">
              {STYLE_FILTERS.map((style) => (
                <button
                  key={style}
                  onClick={() => toggleStyle(style)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors min-h-[44px] ${
                    selectedStyles.has(style)
                      ? "bg-violet-100 dark:bg-violet-900/50 border-violet-400 dark:border-violet-600 text-violet-700 dark:text-violet-300"
                      : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* Mood */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Mood
            </h3>
            <div className="flex flex-wrap gap-2">
              {MOOD_FILTERS.map((mood) => (
                <button
                  key={mood}
                  onClick={() => toggleMood(mood)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors min-h-[44px] ${
                    selectedMoods.has(mood)
                      ? "bg-violet-100 dark:bg-violet-900/50 border-violet-400 dark:border-violet-600 text-violet-700 dark:text-violet-300"
                      : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  {mood}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Date
            </h3>
            <div className="flex flex-wrap gap-2">
              {DATE_FILTERS.map((df) => (
                <button
                  key={df.label}
                  onClick={() => setDateFilter(df.days)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors min-h-[44px] ${
                    dateFilter === df.days
                      ? "bg-violet-100 dark:bg-violet-900/50 border-violet-400 dark:border-violet-600 text-violet-700 dark:text-violet-300"
                      : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  {df.label}
                </button>
              ))}
            </div>
          </div>

          {/* Offline */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Availability
            </h3>
            <button
              onClick={() => setOfflineOnly(!offlineOnly)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors min-h-[44px] flex items-center gap-1.5 ${
                offlineOnly
                  ? "bg-green-100 dark:bg-green-900/40 border-green-400 dark:border-green-600 text-green-700 dark:text-green-300"
                  : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <CheckCircleIcon className="w-3.5 h-3.5" />
              Available offline
            </button>
          </div>

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Gallery grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {songs.length === 0
              ? "No songs yet. Generate your first song to see it here."
              : "No songs match your filters."}
          </p>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="mt-3 text-sm text-violet-600 dark:text-violet-400 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              isPlaying={queue[currentIndex]?.id === song.id && globalIsPlaying}
              onPlayToggle={() => handlePlayToggle(song)}
              onFavoriteToggle={() => handleFavoriteToggle(song)}
              onDownload={() => handleDownload(song)}
              isCached={cachedIds.has(song.id)}
              isSaving={saving.has(song.id)}
              onSaveOffline={() => saveOffline({ id: song.id, title: song.title, imageUrl: song.imageUrl })}
              onRemoveOffline={() => removeOffline(song.id)}
              onPlayNext={() => handlePlayNext(song)}
              onAddToQueue={() => handleAddToQueue(song)}
            />
          ))}
        </div>
      )}
    </div>
    </PullToRefreshContainer>
  );
}
