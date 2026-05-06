"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  PlayIcon,
  PauseIcon,
  MusicalNoteIcon,
  ArrowDownTrayIcon,
  HeartIcon,
  ArrowUpOnSquareStackIcon,
  TrashIcon,
  CheckIcon,
  TagIcon,
  ArrowsRightLeftIcon,
  LockClosedIcon,
  GlobeAltIcon,
  ArrowPathIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import {
  HeartIcon as HeartOutlineIcon,
  QueueListIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { PlayIcon as PlayOutlineIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import type { Song } from "@prisma/client";
import { downloadSongFile } from "@/lib/download";
import { exportAsZip, exportAsM3U, type ExportableSong, type AudioFormat } from "@/lib/export";
import { useToast } from "./Toast";
import { useQueue, type QueueSong } from "./QueueContext";
import { RecentlyPlayed } from "./RecentlyPlayed";
import { LowCreditsBanner } from "./LowCreditsBanner";
import { ShareButton } from "./ShareButton";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { formatBytes } from "@/lib/cache/offline";
import { SongListItem, type SongListItemProps } from "./SongListItem";
import { LibraryToolbar } from "./LibraryToolbar";

// Re-export SongListItemProps as SongRowProps for SwipableSongRow compatibility
type SongRowProps = SongListItemProps;


// ─── Playlist option type (used for batch operations) ─────────────────────────

interface PlaylistOption {
  id: string;
  name: string;
  _count: { songs: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function songToQueueSong(song: Song): QueueSong | null {
  if (!song.audioUrl) return null;
  return {
    id: song.id,
    title: song.title,
    audioUrl: song.audioUrl,
    imageUrl: song.imageUrl,
    duration: song.duration,
    lyrics: song.lyrics,
  };
}

// ─── useDebounce ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── Main LibraryView ─────────────────────────────────────────────────────────

function toDownloadable(song: Song) {
  return {
    id: song.id,
    title: song.title ?? "Untitled",
    audioUrl: song.audioUrl ?? "",
    tags: song.tags ?? undefined,
  };
}

// ─── Highlight helper (used by SongGridCard) ─────────────────────────────────

/** Highlight matching search terms in text with bold spans. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 3) return <>{text}</>;
  const tokens = query
    .replace(/["']/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800/60 text-inherit rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

// ─── Compact grid card for grid view ──────────────────────────────────────────

interface SongGridCardProps {
  song: Song;
  isActive: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  selectionMode: boolean;
  searchQuery?: string;
  priority?: boolean;
  onTogglePlay: (song: Song) => void;
  onToggleFavorite: (song: Song) => void;
  onToggleSelect: (songId: string) => void;
  onLongPress: (songId: string) => void;
}

function SongGridCard({ song, isActive, isPlaying, isSelected, selectionMode, searchQuery = "", priority = false, onTogglePlay, onToggleFavorite, onToggleSelect, onLongPress }: SongGridCardProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartPos.current = { x: t.clientX, y: t.clientY };
    longPressTimer.current = setTimeout(() => { onLongPress(song.id); }, 500);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - touchStartPos.current.x) > 10 || Math.abs(t.clientY - touchStartPos.current.y) > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function handleTouchEnd() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    touchStartPos.current = null;
  }

  return (
    <li
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`group relative bg-white dark:bg-gray-900 rounded-xl border overflow-hidden transition-colors ${
        isSelected
          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
          : "border-gray-200 dark:border-gray-800 hover:border-violet-300 dark:hover:border-violet-700"
      }`}
    >
      {/* Selection checkbox overlay */}
      <button
        onClick={() => onToggleSelect(song.id)}
        aria-label={isSelected ? "Deselect song" : "Select song"}
        className={`absolute top-2 left-2 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
          selectionMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        } ${isSelected ? "bg-violet-600 border-violet-600 text-white" : "border-white bg-black/20 hover:border-violet-400"}`}
      >
        {isSelected && <CheckIcon className="w-4 h-4" />}
      </button>

      {/* Cover image */}
      <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
        {song.imageUrl ? (
          <Image
            src={song.imageUrl}
            alt={song.title ?? "Song cover"}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            placeholder="blur"
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHZpZXdCb3g9IjAgMCAxMCAxMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiM3YzNhZWQiIGZpbGwtb3BhY2l0eT0iMC4yIi8+PC9zdmc+"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-700" aria-hidden="true" />
          </div>
        )}

        {/* Play button overlay */}
        <button
          onClick={() => onTogglePlay(song)}
          aria-label={isActive && isPlaying ? "Pause" : "Play"}
          className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
        >
          <span className={`flex items-center justify-center w-12 h-12 rounded-full bg-white/90 shadow-lg transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            {isActive && isPlaying ? (
              <PauseIcon className="w-6 h-6 text-violet-600" />
            ) : (
              <PlayIcon className="w-6 h-6 text-violet-600 ml-0.5" />
            )}
          </span>
        </button>

        {/* Playing indicator bars */}
        {isActive && isPlaying && (
          <div className="absolute bottom-2 left-2 flex items-end gap-0.5" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <span key={i} className="w-1 bg-violet-400 rounded-full animate-pulse" style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <Link href={`/library/${song.id}`} className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors min-w-0">
          <Highlight text={song.title ?? "Untitled"} query={searchQuery} />
        </Link>
        <div className="flex items-center gap-1 flex-shrink-0">
          <ShareButton
            song={song}
            source="library_grid"
            className="text-gray-400 hover:text-violet-500 transition-colors"
          />
          <button
            onClick={() => onToggleFavorite(song)}
            aria-label={(song as Song & { isFavorite?: boolean }).isFavorite ? "Remove from favorites" : "Add to favorites"}
            className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
          >
            {(song as Song & { isFavorite?: boolean }).isFavorite ? (
              <HeartIcon className="w-4 h-4 text-red-500" />
            ) : (
              <HeartOutlineIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </li>
  );
}

interface LibraryViewProps {
  initialSongs: Song[];
  title?: string;
  enableServerSearch?: boolean;
}

// ─── SwipableSongRow ──────────────────────────────────────────────────────────
// Wraps SongListItem with mobile swipe gestures:
//   Swipe left  → reveals quick-action panel (share / download / delete)
//   Swipe right → triggers play
// Only active on touch (pointer: coarse) devices; falls back to SongListItem on desktop.

function SwipableSongRow(props: SongRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const isOpen = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startBase = useRef(0);
  const directionLocked = useRef<"horizontal" | "vertical" | null>(null);

  // Stable refs for callbacks so the effect doesn't need to re-register
  const onTogglePlayRef = useRef(props.onTogglePlay);
  const initialSongRef = useRef(props.initialSong);
  const onSingleArchiveRef = useRef(props.onSingleArchive);
  const onDownloadRef = useRef(props.onDownload);
  useEffect(() => { onTogglePlayRef.current = props.onTogglePlay; }, [props.onTogglePlay]);
  useEffect(() => { initialSongRef.current = props.initialSong; }, [props.initialSong]);
  useEffect(() => { onSingleArchiveRef.current = props.onSingleArchive; }, [props.onSingleArchive]);
  useEffect(() => { onDownloadRef.current = props.onDownload; }, [props.onDownload]);

  const REVEAL_WIDTH = 156; // 3 × 52 px action buttons
  const SNAP_THRESHOLD = 60;

  function vibrate(ms = 10) {
    try { navigator.vibrate?.(ms); } catch { /* Vibration API not available */ }
  }

  useEffect(() => {
    // Disable gestures on non-touch (desktop pointer) devices
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const el = containerRef.current;
    if (!el) return;

    function handleTouchStart(e: TouchEvent) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      startBase.current = isOpen.current ? -REVEAL_WIDTH : 0;
      directionLocked.current = null;
      setIsDragging(true);
    }

    function handleTouchMove(e: TouchEvent) {
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      if (directionLocked.current === null) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          directionLocked.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
        }
        return;
      }

      if (directionLocked.current !== "horizontal") return;

      const newOffset = Math.max(-REVEAL_WIDTH, Math.min(REVEAL_WIDTH, startBase.current + dx));
      setOffset(newOffset);
    }

    function handleTouchEnd() {
      setIsDragging(false);
      directionLocked.current = null;

      setOffset((currentOffset) => {
        const dx = currentOffset - startBase.current;
        const wasOpen = isOpen.current;

        if (!wasOpen) {
          if (dx >= SNAP_THRESHOLD) {
            // Swipe right → play
            onTogglePlayRef.current(initialSongRef.current);
            vibrate(15);
            return 0;
          } else if (dx <= -SNAP_THRESHOLD) {
            // Swipe left → snap open to reveal actions
            vibrate(10);
            isOpen.current = true;
            return -REVEAL_WIDTH;
          }
          return 0;
        } else {
          // Card is open — swipe right enough to close
          if (dx >= SNAP_THRESHOLD) {
            isOpen.current = false;
            return 0;
          }
          return -REVEAL_WIDTH;
        }
      });
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty — all mutable state accessed via refs

  const song = props.initialSong;
  const hasAudio = Boolean(song.audioUrl) && song.generationStatus !== "pending";

  function handleQuickShare() {
    setOffset(0);
    isOpen.current = false;
    vibrate(10);
    const shareUrl = `${window.location.origin}/library/${song.id}`;
    if (navigator.share) {
      navigator.share({ title: song.title ?? "Song", url: shareUrl }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(shareUrl).catch(() => {});
    }
  }

  function handleQuickDownload() {
    setOffset(0);
    isOpen.current = false;
    vibrate(10);
    onDownloadRef.current(song);
  }

  function handleQuickDelete() {
    setOffset(0);
    isOpen.current = false;
    vibrate(15);
    onSingleArchiveRef.current(song);
  }

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-xl">
      {/* Quick-action panel (hidden behind, revealed on swipe-left) */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: REVEAL_WIDTH }}
        aria-hidden="true"
      >
        <button
          onClick={handleQuickShare}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-blue-500 text-white active:bg-blue-600 transition-colors"
          aria-label="Share song"
          tabIndex={-1}
        >
          <ArrowUpOnSquareStackIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium">Share</span>
        </button>
        <button
          onClick={handleQuickDownload}
          disabled={!hasAudio}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-violet-600 text-white active:bg-violet-700 disabled:opacity-40 transition-colors"
          aria-label="Download song"
          tabIndex={-1}
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium">Save</span>
        </button>
        <button
          onClick={handleQuickDelete}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-red-500 text-white active:bg-red-600 transition-colors"
          aria-label="Archive song"
          tabIndex={-1}
        >
          <TrashIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium">Delete</span>
        </button>
      </div>

      {/* Foreground: the song card — translates on swipe */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
        onClick={offset !== 0 ? (e) => { e.stopPropagation(); setOffset(0); isOpen.current = false; } : undefined}
      >
        <SongListItem {...props} />
      </div>
    </div>
  );
}

export function LibraryView({
  initialSongs,
  title = "Library",
  enableServerSearch = true,
}: LibraryViewProps) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    queue,
    currentIndex,
    isPlaying,
    currentTime,
    duration: audioDuration,
    togglePlay,
    playQueue,
    seek,
  } = useQueue();

  const currentSongId = currentIndex >= 0 ? queue[currentIndex]?.id ?? null : null;

  // ─── Filter state (initialized from URL params) ───────────────────────────
  const [searchText, setSearchText] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [ratingFilter, setRatingFilter] = useState(searchParams.get("minRating") ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") ?? "newest");
  const [tagFilter, setTagFilter] = useState<string[]>(() => {
    const p = searchParams.get("tagIds") ?? searchParams.get("tagId") ?? "";
    return p ? p.split(",").filter(Boolean) : [];
  });
  const [smartFilter, setSmartFilter] = useState(searchParams.get("smartFilter") ?? "");
  // Advanced filters
  const [genreFilter, setGenreFilter] = useState<string[]>(() => {
    const p = searchParams.get("genre");
    return p ? p.split(",").filter(Boolean) : [];
  });
  const [moodFilter, setMoodFilter] = useState<string[]>(() => {
    const p = searchParams.get("mood");
    return p ? p.split(",").filter(Boolean) : [];
  });
  const [tempoMin, setTempoMin] = useState(searchParams.get("tempoMin") ?? "");
  const [tempoMax, setTempoMax] = useState(searchParams.get("tempoMax") ?? "");
  const [includeVariations, setIncludeVariations] = useState(searchParams.get("includeVariations") === "true");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    if (typeof window === "undefined") return "list";
    return (localStorage.getItem("library-view-mode") as "list" | "grid") ?? "list";
  });
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string; color: string; _count?: { songTags: number } }[]>([]);

  const debouncedSearch = useDebounce(searchText, 300);

  // ─── Song + playback state ────────────────────────────────────────────────
  const [songs, setSongs] = useState<Song[]>(initialSongs);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalSongs, setTotalSongs] = useState<number>(initialSongs.length);

  // ─── Pull-to-refresh state ────────────────────────────────────────────────
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullingRefresh, setIsPullingRefresh] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // ─── Offline cache ────────────────────────────────────────────────────────
  const { cachedIds, stats: offlineStats, saving: offlineSaving, saveOffline, removeOffline, clearAll: clearOffline } = useOfflineCache();
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Selection state
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  // Per-song menu action state
  const [pendingMenuDelete, setPendingMenuDelete] = useState<{ song: Song } | null>(null);
  const [menuDeleteLoading, setMenuDeleteLoading] = useState(false);

  const selectionMode = selectedSongIds.size > 0;
  const isArchiveView = smartFilter === "archived";

  // Export state
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ completed: number; total: number } | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Arrow-key navigation for song list
  const songListRef = useRef<HTMLDivElement>(null);
  const handleSongListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const list = songListRef.current;
      if (!list) return;
      const items = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
      if (items.length === 0) return;
      const currentIdx = items.findIndex((el) => el.contains(document.activeElement) || el === document.activeElement);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
        items[next].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
        items[prev].focus();
      } else if (e.key === "Enter" && currentIdx >= 0) {
        // Play the focused song
        const song = songs[currentIdx];
        if (song) {
          e.preventDefault();
          handleTogglePlay(song);
        }
      } else if (e.key === "f" && currentIdx >= 0) {
        // Toggle favorite on focused song
        const song = songs[currentIdx];
        if (song) {
          e.preventDefault();
          handleToggleFavorite(song);
        }
      } else if (e.key === "Delete" && currentIdx >= 0) {
        // Remove focused song (with confirmation dialog)
        const song = songs[currentIdx];
        if (song) {
          e.preventDefault();
          setSelectedSongIds(new Set([song.id]));
          setShowDeleteConfirm(true);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs]
  );

  // Close export menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    if (exportMenuOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [exportMenuOpen]);

  // ─── Fetch user tags for filter ───────────────────────────────────────────
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => { if (data.tags) setAvailableTags(data.tags); })
      .catch(() => {});
  }, []);

  // ─── Sync filters → URL params ───────────────────────────────────────────
  const hasAnyFilter = !!(debouncedSearch || statusFilter || ratingFilter || dateFrom || dateTo || tagFilter.length > 0 || smartFilter || sortBy !== "newest" || genreFilter.length > 0 || moodFilter.length > 0 || tempoMin || tempoMax || includeVariations);

  useEffect(() => {
    if (!enableServerSearch) return;

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (ratingFilter) params.set("minRating", ratingFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sortBy && sortBy !== "newest") params.set("sortBy", sortBy);
    if (tagFilter.length > 0) params.set("tagIds", tagFilter.join(","));
    if (smartFilter) params.set("smartFilter", smartFilter);
    if (genreFilter.length > 0) params.set("genre", genreFilter.join(","));
    if (moodFilter.length > 0) params.set("mood", moodFilter.join(","));
    if (tempoMin) params.set("tempoMin", tempoMin);
    if (tempoMax) params.set("tempoMax", tempoMax);
    if (includeVariations) params.set("includeVariations", "true");

    const qs = params.toString();
    const newUrl = qs ? `${pathname}?${qs}` : pathname;
    router.replace(newUrl, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, ratingFilter, dateFrom, dateTo, sortBy, tagFilter, smartFilter, genreFilter, moodFilter, tempoMin, tempoMax, includeVariations, enableServerSearch]);

  // ─── Build filter query string (shared by initial fetch and load-more) ───
  function buildFilterParams(): URLSearchParams {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (ratingFilter) params.set("minRating", ratingFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sortBy) params.set("sortBy", sortBy);
    if (tagFilter.length > 0) params.set("tagIds", tagFilter.join(","));
    if (smartFilter === "archived") {
      params.set("archived", "true");
    } else if (smartFilter) {
      params.set("smartFilter", smartFilter);
    }
    if (genreFilter.length > 0) params.set("genre", genreFilter.join(","));
    if (moodFilter.length > 0) params.set("mood", moodFilter.join(","));
    if (tempoMin) params.set("tempoMin", tempoMin);
    if (tempoMax) params.set("tempoMax", tempoMax);
    if (includeVariations) params.set("includeVariations", "true");
    return params;
  }

  // ─── Fetch songs from API when filters change ────────────────────────────
  useEffect(() => {
    if (!enableServerSearch) return;

    const params = buildFilterParams();

    let cancelled = false;
    setLoading(true);
    setNextCursor(null);

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
  }, [debouncedSearch, statusFilter, ratingFilter, dateFrom, dateTo, sortBy, tagFilter, smartFilter, genreFilter, moodFilter, tempoMin, tempoMax, includeVariations, enableServerSearch]);

  // ─── Load more (next page) ──────────────────────────────────────────────
  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;

    const params = buildFilterParams();
    params.set("cursor", nextCursor);

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
  }, [nextCursor, loadingMore, debouncedSearch, statusFilter, ratingFilter, dateFrom, dateTo, sortBy, tagFilter, smartFilter, genreFilter, moodFilter, tempoMin, tempoMax, includeVariations]);

  // ─── Pull-to-refresh: re-fetch songs with current filters ─────────────────
  const handleLibraryRefreshRef = useRef<() => Promise<void>>(async () => {});
  const handleLibraryRefresh = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (ratingFilter) params.set("minRating", ratingFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sortBy) params.set("sortBy", sortBy);
    if (tagFilter.length > 0) params.set("tagIds", tagFilter.join(","));
    if (smartFilter === "archived") {
      params.set("archived", "true");
    } else if (smartFilter) {
      params.set("smartFilter", smartFilter);
    }
    if (genreFilter.length > 0) params.set("genre", genreFilter.join(","));
    if (moodFilter.length > 0) params.set("mood", moodFilter.join(","));
    if (tempoMin) params.set("tempoMin", tempoMin);
    if (tempoMax) params.set("tempoMax", tempoMax);
    if (includeVariations) params.set("includeVariations", "true");
    try {
      const data = await fetch(`/api/songs?${params.toString()}`).then((r) => r.json());
      if (data.songs) {
        setSongs(data.songs);
        setNextCursor(data.nextCursor ?? null);
        setTotalSongs(data.total ?? data.songs.length);
      }
    } catch { /* swallow network errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, ratingFilter, dateFrom, dateTo, sortBy, tagFilter, smartFilter, genreFilter, moodFilter, tempoMin, tempoMax, includeVariations]);

  useEffect(() => { handleLibraryRefreshRef.current = handleLibraryRefresh; }, [handleLibraryRefresh]);

  // ─── Pull-to-refresh: window-level touch handler (works with window scroll) ─
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const pullState = { startY: 0, pulling: false };

    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 5) return;
      pullState.startY = e.touches[0].clientY;
      pullState.pulling = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!pullState.pulling) return;
      const dy = e.touches[0].clientY - pullState.startY;
      if (dy <= 0) {
        pullState.pulling = false;
        setPullDistance(0);
        return;
      }
      setPullDistance(Math.min(dy * 0.5, 80));
    }

    function onTouchEnd() {
      if (!pullState.pulling) return;
      pullState.pulling = false;
      setPullDistance((dist) => {
        if (dist >= 60) {
          setIsPullingRefresh(true);
          handleLibraryRefreshRef.current().finally(() => {
            setIsPullingRefresh(false);
            setPullDistance(0);
          });
          return 48; // hold the indicator while refreshing
        }
        return 0;
      });
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []); // Uses handleLibraryRefreshRef so no deps needed

  // ─── Clear all filters ────────────────────────────────────────────────────
  function clearAllFilters() {
    setSearchText("");
    setStatusFilter("");
    setRatingFilter("");
    setDateFrom("");
    setDateTo("");
    setSortBy("newest");
    setTagFilter([]);
    setSmartFilter("");
    setGenreFilter([]);
    setMoodFilter([]);
    setTempoMin("");
    setTempoMax("");
    setIncludeVariations(false);
  }

  // ─── Song callbacks ───────────────────────────────────────────────────────
  const handleSongUpdate = useCallback((updated: Song) => {
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  // ─── Auto-refresh list when pending songs exist ─────────────────────────
  // Re-fetches every 30s while any song is pending so newly completed songs
  // appear without a manual page reload.
  const hasPending = songs.some((s) => s.generationStatus === "pending");
  useEffect(() => {
    if (!enableServerSearch || !hasPending) return;
    const interval = setInterval(() => {
      const params = buildFilterParams();
      fetch(`/api/songs?${params.toString()}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.songs) {
            setSongs(data.songs);
            setNextCursor(data.nextCursor ?? null);
            setTotalSongs(data.total ?? data.songs.length);
          }
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPending, enableServerSearch]);

  async function handleTogglePlay(song: Song) {
    // If the song is already active, just toggle without re-loading
    if (currentSongId === song.id) {
      const qs = songToQueueSong(song);
      if (qs) togglePlay(qs);
      return;
    }

    // Check if the audio URL might be expired (within 3 days of expiry or no expiry set)
    const REFRESH_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
    const rawExpiresAt = (song as Song & { audioUrlExpiresAt?: Date | string | null }).audioUrlExpiresAt;
    const expiresAtMs = rawExpiresAt ? new Date(rawExpiresAt).getTime() : null;
    const isNearExpiry =
      song.audioUrl &&
      (!expiresAtMs || isNaN(expiresAtMs) || expiresAtMs - Date.now() < REFRESH_THRESHOLD_MS);

    let playSong = song;
    if (isNearExpiry) {
      try {
        const res = await fetch(`/api/songs/${song.id}/refresh`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          if (data.song?.audioUrl) {
            playSong = { ...song, audioUrl: data.song.audioUrl };
            handleSongUpdate(playSong);
          }
        } else if (res.status === 404) {
          const data = await res.json().catch(() => ({}));
          if (data.code === "SONG_DELETED") {
            toast("This song no longer exists on Suno and cannot be played.", "error");
            return;
          }
        }
      } catch {
        // Transient error — try playing with whatever URL we have
      }
    }

    const qs = songToQueueSong(playSong);
    if (!qs) return;

    // Build a queue from all playable songs and start at this one
    const allQueueSongs = songs
      .map(songToQueueSong)
      .filter((s): s is QueueSong => s !== null);
    const idx = allQueueSongs.findIndex((s) => s.id === song.id);
    playQueue(allQueueSongs, idx >= 0 ? idx : 0);
  }

  async function handleDownload(song: Song) {
    if (!song.audioUrl || song.id in downloadProgress) return;
    setDownloadErrors((e) => { const n = { ...e }; delete n[song.id]; return n; });
    setDownloadProgress((p) => ({ ...p, [song.id]: 0 }));
    try {
      await downloadSongFile(toDownloadable(song), (pct) =>
        setDownloadProgress((p) => ({ ...p, [song.id]: pct }))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      setDownloadErrors((e) => ({ ...e, [song.id]: msg }));
      toast(msg, "error");
    } finally {
      setTimeout(
        () => setDownloadProgress((p) => { const n = { ...p }; delete n[song.id]; return n; }),
        1500
      );
    }
  }

  function handleSeek(pct: number) {
    seek(pct);
  }

  async function handleToggleFavorite(song: Song) {
    const newFav = !song.isFavorite;
    const prevCount = (song as Song & { favoriteCount?: number }).favoriteCount ?? 0;
    const optimistic = { ...song, isFavorite: newFav, favoriteCount: newFav ? prevCount + 1 : Math.max(0, prevCount - 1) };
    handleSongUpdate(optimistic as Song);

    try {
      const res = await fetch(`/api/songs/${song.id}/favorite`, {
        method: newFav ? "POST" : "DELETE",
      });
      if (!res.ok) {
        handleSongUpdate(song);
        toast("Failed to update favorite", "error");
      } else {
        const data = await res.json();
        handleSongUpdate({ ...song, isFavorite: newFav, favoriteCount: data.favoriteCount } as Song);
        toast(newFav ? "Added to favorites" : "Removed from favorites", "success");
      }
    } catch {
      handleSongUpdate(song);
      toast("Failed to update favorite", "error");
    }
  }

  // ─── Retry handler ──────────────────────────────────────────────────────
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

      if (data.song) {
        handleSongUpdate(data.song);
      }
      toast("Retry started! Song is regenerating.", "success");
      router.refresh();
    } catch {
      toast("Network error. Please check your connection.", "error");
    } finally {
      setRetryingId(null);
    }
  }

  // ─── Selection handlers ──────────────────────────────────────────────────

  function handleToggleSelect(songId: string, shiftKey: boolean) {
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      const songIndex = songs.findIndex((s) => s.id === songId);

      if (shiftKey && lastSelectedIndex !== null && songIndex !== -1) {
        const start = Math.min(lastSelectedIndex, songIndex);
        const end = Math.max(lastSelectedIndex, songIndex);
        for (let i = start; i <= end; i++) {
          next.add(songs[i].id);
        }
      } else if (next.has(songId)) {
        next.delete(songId);
      } else {
        next.add(songId);
      }

      return next;
    });
    const songIndex = songs.findIndex((s) => s.id === songId);
    if (songIndex !== -1) setLastSelectedIndex(songIndex);
  }

  function handleSelectAll() {
    if (selectedSongIds.size === songs.length) {
      setSelectedSongIds(new Set());
      setLastSelectedIndex(null);
    } else {
      setSelectedSongIds(new Set(songs.map((s) => s.id)));
    }
  }

  function clearSelection() {
    setSelectedSongIds(new Set());
    setLastSelectedIndex(null);
  }

  type BatchActionType = "favorite" | "unfavorite" | "delete" | "restore" | "permanent_delete" | "make_public" | "make_private";

  async function handleBatchAction(action: BatchActionType) {
    if (selectedSongIds.size === 0) return;

    if (action === "delete" || action === "permanent_delete") {
      setShowDeleteConfirm(true);
      return;
    }

    await executeBatchAction(action);
  }

  async function executeBatchAction(action: BatchActionType) {
    const songIds = Array.from(selectedSongIds);
    setBatchLoading(true);

    try {
      const res = await fetch("/api/songs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, songIds }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Batch operation failed", "error");
        return;
      }

      const data = await res.json();
      const count = data.affected;

      if (action === "favorite") {
        setSongs((prev) =>
          prev.map((s) => (selectedSongIds.has(s.id) ? { ...s, isFavorite: true } : s))
        );
        toast(`${count} song${count !== 1 ? "s" : ""} added to favorites`, "success");
      } else if (action === "unfavorite") {
        setSongs((prev) =>
          prev.map((s) => (selectedSongIds.has(s.id) ? { ...s, isFavorite: false } : s))
        );
        toast(`${count} song${count !== 1 ? "s" : ""} removed from favorites`, "success");
      } else if (action === "delete") {
        setSongs((prev) => prev.filter((s) => !selectedSongIds.has(s.id)));
        toast(`${count} song${count !== 1 ? "s" : ""} moved to archive`, "success");
      } else if (action === "restore") {
        setSongs((prev) => prev.filter((s) => !selectedSongIds.has(s.id)));
        toast(`${count} song${count !== 1 ? "s" : ""} restored`, "success");
      } else if (action === "permanent_delete") {
        setSongs((prev) => prev.filter((s) => !selectedSongIds.has(s.id)));
        toast(`${count} song${count !== 1 ? "s" : ""} permanently deleted`, "success");
      } else if (action === "make_public") {
        setSongs((prev) =>
          prev.map((s) => (selectedSongIds.has(s.id) ? { ...s, isPublic: true } : s))
        );
        toast(`${count} song${count !== 1 ? "s" : ""} made public`, "success");
      } else if (action === "make_private") {
        setSongs((prev) =>
          prev.map((s) => (selectedSongIds.has(s.id) ? { ...s, isPublic: false } : s))
        );
        toast(`${count} song${count !== 1 ? "s" : ""} made private`, "success");
      }

      clearSelection();
    } catch {
      toast("Batch operation failed", "error");
    } finally {
      setBatchLoading(false);
      setShowDeleteConfirm(false);
    }
  }

  // ─── Per-song (menu) actions ──────────────────────────────────────────────

  async function handleSingleSongAction(song: Song, action: "delete" | "restore" | "permanent_delete") {
    if (action === "permanent_delete") {
      setPendingMenuDelete({ song });
      return;
    }

    try {
      const res = await fetch("/api/songs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, songIds: [song.id] }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Action failed", "error");
        return;
      }
      if (action === "delete") {
        setSongs((prev) => prev.filter((s) => s.id !== song.id));
        toast(`"${song.title ?? "Song"}" moved to archive`, "success");
      } else if (action === "restore") {
        setSongs((prev) => prev.filter((s) => s.id !== song.id));
        toast(`"${song.title ?? "Song"}" restored`, "success");
      }
    } catch {
      toast("Action failed", "error");
    }
  }

  async function executePendingMenuDelete() {
    if (!pendingMenuDelete) return;
    const { song } = pendingMenuDelete;
    setMenuDeleteLoading(true);
    try {
      const res = await fetch("/api/songs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "permanent_delete", songIds: [song.id] }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Delete failed", "error");
        return;
      }
      setSongs((prev) => prev.filter((s) => s.id !== song.id));
      toast(`"${song.title ?? "Song"}" permanently deleted`, "success");
      setPendingMenuDelete(null);
    } catch {
      toast("Delete failed", "error");
    } finally {
      setMenuDeleteLoading(false);
    }
  }

  // ─── Batch tag / playlist / download state ───────────────────────────────
  const [showBatchTagMenu, setShowBatchTagMenu] = useState(false);
  const [showBatchPlaylistMenu, setShowBatchPlaylistMenu] = useState(false);
  const [batchTagLoading, setBatchTagLoading] = useState(false);
  const [batchPlaylistLoading, setBatchPlaylistLoading] = useState(false);
  const [batchPlaylists, setBatchPlaylists] = useState<PlaylistOption[]>([]);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchDownloadProgress, setBatchDownloadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [showBatchDownloadFormatMenu, setShowBatchDownloadFormatMenu] = useState(false);
  const [batchDownloadFormat, setBatchDownloadFormat] = useState<AudioFormat>("mp3");
  const batchTagMenuRef = useRef<HTMLDivElement>(null);
  const batchPlaylistMenuRef = useRef<HTMLDivElement>(null);
  const batchDownloadFormatMenuRef = useRef<HTMLDivElement>(null);

  // Close batch tag menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (batchTagMenuRef.current && !batchTagMenuRef.current.contains(e.target as Node)) {
        setShowBatchTagMenu(false);
      }
    }
    if (showBatchTagMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showBatchTagMenu]);

  // Close batch playlist menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (batchPlaylistMenuRef.current && !batchPlaylistMenuRef.current.contains(e.target as Node)) {
        setShowBatchPlaylistMenu(false);
      }
    }
    if (showBatchPlaylistMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showBatchPlaylistMenu]);

  // Close batch download format menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (batchDownloadFormatMenuRef.current && !batchDownloadFormatMenuRef.current.contains(e.target as Node)) {
        setShowBatchDownloadFormatMenu(false);
      }
    }
    if (showBatchDownloadFormatMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showBatchDownloadFormatMenu]);

  async function handleBatchTag(tagId: string) {
    setShowBatchTagMenu(false);
    if (selectedSongIds.size === 0) return;
    setBatchTagLoading(true);
    try {
      const res = await fetch("/api/songs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tag", songIds: Array.from(selectedSongIds), tagId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Batch tag failed", "error");
        return;
      }
      const data = await res.json();
      toast(`Tagged ${data.affected} song${data.affected !== 1 ? "s" : ""}`, "success");
      clearSelection();
      // Refresh songs to show updated tags
      router.refresh();
    } catch {
      toast("Batch tag failed", "error");
    } finally {
      setBatchTagLoading(false);
    }
  }

  async function handleBatchAddToPlaylist(playlistId: string) {
    setShowBatchPlaylistMenu(false);
    if (selectedSongIds.size === 0) return;
    setBatchPlaylistLoading(true);
    try {
      const res = await fetch("/api/songs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_to_playlist", songIds: Array.from(selectedSongIds), playlistId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Batch add to playlist failed", "error");
        return;
      }
      const data = await res.json();
      toast(`Added ${data.affected} song${data.affected !== 1 ? "s" : ""} to playlist`, "success");
      clearSelection();
    } catch {
      toast("Batch add to playlist failed", "error");
    } finally {
      setBatchPlaylistLoading(false);
    }
  }

  async function openBatchPlaylistMenu() {
    setShowBatchPlaylistMenu(true);
    try {
      const res = await fetch("/api/playlists");
      if (res.ok) {
        const data = await res.json();
        setBatchPlaylists(data.playlists);
      }
    } catch { /* ignore */ }
  }

  async function handleBatchDownload(fmt: AudioFormat = batchDownloadFormat) {
    setShowBatchDownloadFormatMenu(false);
    if (selectedSongIds.size === 0) return;
    const selectedSongs = songs
      .filter((s) => selectedSongIds.has(s.id) && s.audioUrl && s.generationStatus === "ready")
      .map((s) => ({
        id: s.id,
        title: s.title,
        audioUrl: s.audioUrl!,
        tags: s.tags,
        duration: s.duration,
        createdAt: s.createdAt,
      }));
    if (selectedSongs.length === 0) {
      toast("No downloadable songs selected", "info");
      return;
    }
    setBatchDownloading(true);
    setBatchDownloadProgress({ completed: 0, total: selectedSongs.length });
    try {
      await exportAsZip(
        selectedSongs,
        (completed, total) => setBatchDownloadProgress({ completed, total }),
        { format: fmt }
      );
      toast(`Downloaded ${selectedSongs.length} song${selectedSongs.length !== 1 ? "s" : ""} as ${fmt.toUpperCase()} ZIP`, "success");
      clearSelection();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Download failed", "error");
    } finally {
      setBatchDownloading(false);
      setBatchDownloadProgress(null);
    }
  }

  // ─── Export helpers ───────────────────────────────────────────────────────
  const exportableSongs = useMemo<ExportableSong[]>(() => {
    return songs
      .filter((s) => s.audioUrl && s.generationStatus === "ready")
      .map((s) => ({
        id: s.id,
        title: s.title,
        audioUrl: s.audioUrl!,
        tags: s.tags,
        duration: s.duration,
        createdAt: s.createdAt,
      }));
  }, [songs]);

  async function handleExportZip() {
    setExportMenuOpen(false);
    if (exportableSongs.length === 0) {
      toast("No songs available to export", "info");
      return;
    }
    if (exportableSongs.length > 50) {
      toast(`Exporting ${exportableSongs.length} songs — this may take a while`, "info");
    }
    setExporting(true);
    setExportProgress({ completed: 0, total: exportableSongs.length });
    try {
      await exportAsZip(exportableSongs, (completed, total) => {
        setExportProgress({ completed, total });
      });
      toast("ZIP export complete!", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }

  function handleExportM3U() {
    setExportMenuOpen(false);
    if (exportableSongs.length === 0) {
      toast("No songs available to export", "info");
      return;
    }
    try {
      exportAsM3U(exportableSongs);
      toast("M3U playlist exported!", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    }
  }

  // ─── Play All ──────────────────────────────────────────────────────────────
  function handlePlayAll() {
    const allQueueSongs = songs
      .map(songToQueueSong)
      .filter((s): s is QueueSong => s !== null);
    if (allQueueSongs.length > 0) {
      playQueue(allQueueSongs, 0);
    }
  }

  const hasPlayableSongs = songs.some((s) => s.audioUrl && s.generationStatus === "ready");
  const hasActiveFilters = !!(statusFilter || ratingFilter || dateFrom || dateTo || tagFilter.length > 0 || smartFilter || genreFilter.length > 0 || moodFilter.length > 0 || tempoMin || tempoMax || includeVariations);

  // ─── Virtualizer for list view ───────────────────────────────────────────
  const listScrollMarginRef = useRef(0);
  useLayoutEffect(() => {
    listScrollMarginRef.current = songListRef.current?.offsetTop ?? 0;
  });

  const rowVirtualizer = useWindowVirtualizer({
    count: viewMode === "list" ? songs.length : 0,
    estimateSize: () => 120,
    overscan: 5,
    scrollMargin: listScrollMarginRef.current,
  });

  // ─── Infinite scroll sentinel ────────────────────────────────────────────
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !nextCursor || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, handleLoadMore]);

  return (
    <div className="px-4 py-4 space-y-4" data-tour="library">
      {/* Pull-to-refresh indicator (mobile only) */}
      {(pullDistance > 0 || isPullingRefresh) && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all"
          style={{ height: isPullingRefresh ? 48 : pullDistance }}
        >
          <ArrowPathIcon
            className={`w-5 h-5 text-violet-500 transition-transform ${isPullingRefresh ? "animate-spin" : ""}`}
            style={{ transform: isPullingRefresh ? undefined : `rotate(${pullDistance * 4.5}deg)` }}
          />
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
            {isPullingRefresh ? "Refreshing…" : pullDistance >= 60 ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      )}

      {/* Low credits banner — shown when user is running low */}
      <LowCreditsBanner />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            {loading ? "Searching…" : `${songs.length}${totalSongs > songs.length ? ` of ${totalSongs}` : ""} song${totalSongs !== 1 ? "s" : ""}`}
          </p>
          {songs.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="mt-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors"
            >
              {selectedSongIds.size === songs.length ? "Deselect all" : "Select all"}
            </button>
          )}
          {offlineStats.count > 0 && (
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <CheckIcon className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
              <span>{offlineStats.count} offline · {formatBytes(offlineStats.totalBytes)}</span>
              <button
                onClick={clearOffline}
                className="text-red-500 hover:text-red-400 transition-colors"
                aria-label="Clear all offline songs"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-2">
        {/* Export button */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setExportMenuOpen((o) => !o)}
            disabled={exporting}
            aria-label="Export library"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              exporting
                ? "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                : "bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            }`}
          >
            <ArrowUpOnSquareStackIcon className="w-4 h-4" />
            {exporting && exportProgress
              ? `${exportProgress.completed}/${exportProgress.total}`
              : "Export"}
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden">
              <button
                onClick={handleExportZip}
                className="w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Download as ZIP
              </button>
              <button
                onClick={handleExportM3U}
                className="w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-t border-gray-200 dark:border-gray-800"
              >
                Export M3U playlist
              </button>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Export progress bar */}
      {exporting && exportProgress && (
        <div className="space-y-1">
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((exportProgress.completed / exportProgress.total) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Downloading {exportProgress.completed} of {exportProgress.total} songs…
          </p>
        </div>
      )}

      {/* Play All button */}
      {hasPlayableSongs && !selectionMode && (
        <button
          onClick={handlePlayAll}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors min-h-[44px]"
        >
          <PlayOutlineIcon className="w-4 h-4" />
          Play All
        </button>
      )}

      {/* Recently Played — only show on default (non-filtered, non-search) library view */}
      {enableServerSearch && !searchText && !statusFilter && !ratingFilter && tagFilter.length === 0 && !smartFilter && (
        <RecentlyPlayed />
      )}

      {/* Search bar + filters */}
      {enableServerSearch && (
        <LibraryToolbar
          searchText={searchText}
          setSearchText={setSearchText}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          hasActiveFilters={hasActiveFilters}
          viewMode={viewMode}
          setViewMode={setViewMode}
          smartFilter={smartFilter}
          setSmartFilter={setSmartFilter}
          includeVariations={includeVariations}
          setIncludeVariations={setIncludeVariations}
          sortBy={sortBy}
          setSortBy={setSortBy}
          hasAnyFilter={hasAnyFilter}
          clearAllFilters={clearAllFilters}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          ratingFilter={ratingFilter}
          setRatingFilter={setRatingFilter}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          availableTags={availableTags}
          tagFilter={tagFilter}
          setTagFilter={setTagFilter}
          genreFilter={genreFilter}
          setGenreFilter={setGenreFilter}
          moodFilter={moodFilter}
          setMoodFilter={setMoodFilter}
          tempoMin={tempoMin}
          setTempoMin={setTempoMin}
          tempoMax={tempoMax}
          setTempoMax={setTempoMax}
        />
      )}

      {/* Song list */}
      {songs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
          <MusicalNoteIcon className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" aria-hidden="true" />
          {isArchiveView ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Your archive is empty.</p>
          ) : hasAnyFilter ? (
            <>
              <p className="text-gray-500 dark:text-gray-400 text-sm">No songs match your filters.</p>
              <button
                onClick={clearAllFilters}
                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
              >
                Clear all filters
              </button>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No songs yet</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                Create your first AI-generated song — describe a mood, genre, or vibe and let the music flow.
              </p>
              <Link
                href="/generate"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Generate your first song
              </Link>
            </>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <ul aria-label="Song library" className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 ${selectionMode ? "pb-20" : ""}`}>
          {songs.map((song, idx) => (
            <SongGridCard
              key={song.id}
              song={song}
              isActive={currentSongId === song.id}
              isPlaying={isPlaying}
              isSelected={selectedSongIds.has(song.id)}
              selectionMode={selectionMode}
              searchQuery={debouncedSearch}
              priority={idx < 4}
              onTogglePlay={handleTogglePlay}
              onToggleFavorite={handleToggleFavorite}
              onToggleSelect={(songId) => handleToggleSelect(songId, false)}
              onLongPress={(songId) => setSelectedSongIds(new Set([songId]))}
            />
          ))}
        </ul>
      ) : (
        <div
          ref={songListRef}
          aria-label="Song library"
          role="listbox"
          aria-orientation="vertical"
          onKeyDown={handleSongListKeyDown}
          className={selectionMode ? "pb-20" : ""}
          style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const song = songs[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                  paddingBottom: "0.5rem",
                }}
              >
                <SwipableSongRow
                  key={song.id}
                  initialSong={song}
                  isActive={currentSongId === song.id}
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  audioDuration={audioDuration}
                  rating={song.rating ? { stars: song.rating, note: song.ratingNote ?? "" } : undefined}
                  downloadProgress={downloadProgress[song.id] ?? null}
                  downloadError={downloadErrors[song.id] ?? null}
                  isSelected={selectedSongIds.has(song.id)}
                  selectionMode={selectionMode}
                  searchQuery={debouncedSearch}
                  isCached={cachedIds.has(song.id)}
                  isSaving={offlineSaving.has(song.id)}
                  isOnline={isOnline}
                  onTogglePlay={handleTogglePlay}
                  onDownload={handleDownload}
                  onSaveOffline={(s) => saveOffline({ id: s.id, title: s.title, imageUrl: s.imageUrl })}
                  onRemoveOffline={removeOffline}
                  onSeek={handleSeek}
                  onUpdate={handleSongUpdate}
                  onToggleFavorite={handleToggleFavorite}
                  onToggleSelect={handleToggleSelect}
                  onLongPress={(songId) => setSelectedSongIds(new Set([songId]))}
                  onRetry={handleRetry}
                  retryingId={retryingId}
                  isArchiveView={isArchiveView}
                  onSingleArchive={(s) => handleSingleSongAction(s, "delete")}
                  onSingleRestore={(s) => handleSingleSongAction(s, "restore")}
                  onSingleDeleteForever={(s) => handleSingleSongAction(s, "permanent_delete")}
                  onTagClick={(tagId) => setTagFilter((prev) => prev.includes(tagId) ? prev : [...prev, tagId])}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Infinite scroll sentinel + loading indicator */}
      {nextCursor && !loading && (
        <div ref={loadMoreSentinelRef} className="flex items-center justify-center py-4" aria-live="polite">
          {loadingMore ? (
            <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading more…
            </span>
          ) : (
            <button
              onClick={handleLoadMore}
              className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
            >
              Load more ({totalSongs - songs.length} remaining)
            </button>
          )}
        </div>
      )}

      {/* Batch download progress bar */}
      {batchDownloading && batchDownloadProgress && (
        <div className="space-y-1">
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((batchDownloadProgress.completed / batchDownloadProgress.total) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Downloading {batchDownloadProgress.completed} of {batchDownloadProgress.total} songs…
          </p>
        </div>
      )}

      {/* Floating action bar */}
      {selectionMode && (
        <div className="fixed bottom-20 md:bottom-4 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40 flex items-center gap-2 px-4 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl border border-gray-700 animate-slide-in overflow-x-auto">
          <span className="text-sm font-medium mr-1 flex-shrink-0">
            {selectedSongIds.size} selected
          </span>

          <button
            onClick={() => handleBatchAction("favorite")}
            disabled={batchLoading}
            aria-label="Add selected to favorites"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-pink-600 hover:bg-pink-500 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <HeartIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Favorite</span>
          </button>

          <button
            onClick={() => handleBatchAction("unfavorite")}
            disabled={batchLoading}
            aria-label="Remove selected from favorites"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <HeartOutlineIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Unfavorite</span>
          </button>

          {/* Batch Make Public */}
          <button
            onClick={() => handleBatchAction("make_public")}
            disabled={batchLoading}
            aria-label="Make selected songs public"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <GlobeAltIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Make Public</span>
          </button>

          {/* Batch Make Private */}
          <button
            onClick={() => handleBatchAction("make_private")}
            disabled={batchLoading}
            aria-label="Make selected songs private"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <LockClosedIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Make Private</span>
          </button>

          {/* Batch Tag */}
          <div className="relative" ref={batchTagMenuRef}>
            <button
              onClick={() => setShowBatchTagMenu((o) => !o)}
              disabled={batchTagLoading || availableTags.length === 0}
              aria-label="Tag selected songs"
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              <TagIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Tag</span>
            </button>

            {showBatchTagMenu && (
              <div className="absolute bottom-full mb-1 left-0 w-48 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto">
                {availableTags.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">No tags yet</p>
                ) : (
                  availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => handleBatchTag(tag.id)}
                      className="w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b last:border-b-0 border-gray-200 dark:border-gray-800 flex items-center gap-2"
                    >
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Batch Add to Playlist */}
          <div className="relative" ref={batchPlaylistMenuRef}>
            <button
              onClick={openBatchPlaylistMenu}
              disabled={batchPlaylistLoading}
              aria-label="Add selected to playlist"
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              <QueueListIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Playlist</span>
            </button>

            {showBatchPlaylistMenu && (
              <div className="absolute bottom-full mb-1 left-0 w-48 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto">
                {batchPlaylists.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">No playlists yet</p>
                ) : (
                  batchPlaylists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => handleBatchAddToPlaylist(pl.id)}
                      className="w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b last:border-b-0 border-gray-200 dark:border-gray-800"
                    >
                      {pl.name}
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        ({pl._count.songs})
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Batch Download with format picker */}
          <div className="relative flex-shrink-0" ref={batchDownloadFormatMenuRef}>
            <div className="flex items-stretch">
              <button
                onClick={() => handleBatchDownload()}
                disabled={batchDownloading}
                aria-label="Download selected songs as ZIP"
                className="flex items-center gap-1.5 pl-3 pr-2 py-2 rounded-l-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {batchDownloading && batchDownloadProgress
                    ? `${batchDownloadProgress.completed}/${batchDownloadProgress.total}`
                    : `${batchDownloadFormat.toUpperCase()} ZIP`}
                </span>
              </button>
              <button
                onClick={() => setShowBatchDownloadFormatMenu((v) => !v)}
                disabled={batchDownloading}
                aria-label="Choose batch download format"
                className="flex items-center justify-center px-1.5 py-2 rounded-r-lg bg-gray-700 hover:bg-gray-600 text-white border-l border-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                <ChevronDownIcon className={`w-3 h-3 transition-transform duration-150 ${showBatchDownloadFormatMenu ? "rotate-180" : ""}`} />
              </button>
            </div>
            {showBatchDownloadFormatMenu && (
              <div className="absolute bottom-full mb-1 left-0 w-40 bg-gray-900 border border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden py-1 text-sm">
                {(["mp3", "wav", "flac"] as AudioFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => { setBatchDownloadFormat(fmt); handleBatchDownload(fmt); }}
                    className={`w-full text-left px-3 py-2 transition-colors ${batchDownloadFormat === fmt ? "bg-gray-700 text-white" : "hover:bg-gray-800 text-gray-300"}`}
                  >
                    {fmt.toUpperCase()}
                    {fmt === "mp3" && <span className="ml-1 text-xs text-gray-500">· default</span>}
                    {(fmt === "wav" || fmt === "flac") && <span className="ml-1 text-xs text-gray-500">· WAV source</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Compare (only when exactly 2 songs selected) */}
          {selectedSongIds.size === 2 && (() => {
            const [idA, idB] = Array.from(selectedSongIds);
            return (
              <button
                onClick={() => router.push(`/compare?a=${idA}&b=${idB}`)}
                aria-label="Compare selected songs"
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 transition-colors min-h-[44px]"
              >
                <ArrowsRightLeftIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Compare</span>
              </button>
            );
          })()}

          {isArchiveView ? (
            <>
              <button
                onClick={() => handleBatchAction("restore")}
                disabled={batchLoading}
                aria-label="Restore selected songs"
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-500 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                <ArrowPathIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Restore</span>
              </button>
              <button
                onClick={() => handleBatchAction("permanent_delete")}
                disabled={batchLoading}
                aria-label="Permanently delete selected songs"
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                <TrashIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Delete forever</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => handleBatchAction("delete")}
              disabled={batchLoading}
              aria-label="Delete selected songs"
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              <TrashIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}

          <button
            onClick={clearSelection}
            aria-label="Clear selection"
            className="flex-shrink-0 ml-1 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors min-h-[44px]"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Delete / Permanent delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" onKeyDown={(e) => { if (e.key === "Escape") setShowDeleteConfirm(false); }}>
          <div className="bg-white dark:bg-gray-900 w-full sm:rounded-2xl rounded-t-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 sm:mx-4 sm:max-w-sm">
            <h3 id="delete-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              {isArchiveView
                ? `Permanently delete ${selectedSongIds.size} song${selectedSongIds.size !== 1 ? "s" : ""}?`
                : `Delete ${selectedSongIds.size} song${selectedSongIds.size !== 1 ? "s" : ""}?`}
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {isArchiveView
                ? "This action cannot be undone. The selected songs will be permanently removed from your library."
                : "The selected songs will be moved to your archive. You can restore them later."}
            </p>
            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={batchLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => executeBatchAction(isArchiveView ? "permanent_delete" : "delete")}
                disabled={batchLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                {batchLoading
                  ? (isArchiveView ? "Deleting forever…" : "Archiving…")
                  : (isArchiveView ? "Delete forever" : "Delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-song menu: permanent delete confirmation */}
      {pendingMenuDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="menu-delete-dialog-title"
          onKeyDown={(e) => { if (e.key === "Escape") setPendingMenuDelete(null); }}
        >
          <div className="bg-white dark:bg-gray-900 w-full sm:rounded-2xl rounded-t-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 sm:mx-4 sm:max-w-sm">
            <h3 id="menu-delete-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Permanently delete &ldquo;{pendingMenuDelete.song.title ?? "this song"}&rdquo;?
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              This action cannot be undone. The song will be permanently removed from your library.
            </p>
            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => setPendingMenuDelete(null)}
                disabled={menuDeleteLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={executePendingMenuDelete}
                disabled={menuDeleteLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                {menuDeleteLoading ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
