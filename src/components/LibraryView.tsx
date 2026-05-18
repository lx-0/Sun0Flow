"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
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
import type { Song } from "@prisma/client";
import { downloadSongFile } from "@/lib/download";
import { exportAsZip, exportAsM3U, type ExportableSong, type AudioFormat } from "@/lib/export";
import { useToast } from "./Toast";
import { useQueue, type QueueSong } from "./QueueContext";
import { RecentlyPlayed } from "./RecentlyPlayed";
import { LowCreditsBanner } from "./LowCreditsBanner";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { formatBytes } from "@/lib/cache/offline";
import { LibraryToolbar } from "./LibraryToolbar";
import { useDebounce } from "@/hooks/useDebounce";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { songToQueueSong } from "@/lib/song-mappers";
import { useSongsList, type SongsFilters } from "@/hooks/useSongsList";
import { useTagsList } from "@/hooks/useTagsList";
import {
  fetchPlaylistOptions,
  runSongsBatchAction,
  type LibraryBatchAction,
} from "@/lib/songs/library-client";
import { SongGridCard } from "./library/song-grid-card";
import { SwipableSongRow } from "./library/swipable-song-row";
import type { SongListItemProps } from "./SongListItem";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";

// ─── Playlist option type (used for batch operations) ─────────────────────────

interface PlaylistOption {
  id: string;
  name: string;
  _count: { songs: number };
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

// ─── Compact grid card for grid view ──────────────────────────────────────────


interface LibraryViewProps {
  initialSongs: Song[];
  title?: string;
  enableServerSearch?: boolean;
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
    try {
      return (localStorage.getItem("library-view-mode") as "list" | "grid") ?? "list";
    } catch {
      return "list";
    }
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
  const batchDeleteDialogRef = useRef<HTMLDivElement>(null);
  const pendingDeleteDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(batchDeleteDialogRef, showDeleteConfirm, () => setShowDeleteConfirm(false));
  useDialogFocusTrap(pendingDeleteDialogRef, Boolean(pendingMenuDelete), () => setPendingMenuDelete(null));

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

  useOutsideClick(exportMenuRef, () => setExportMenuOpen(false), exportMenuOpen);

  // ─── Fetch user tags for filter ───────────────────────────────────────────
  const tagsQuery = useTagsList();
  useEffect(() => {
    if (tagsQuery.data) setAvailableTags(tagsQuery.data);
  }, [tagsQuery.data]);

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

  // ─── Songs query (filter change, load-more, refresh, pending-poll) ───────
  // One useInfiniteQuery replaces four hand-rolled fetch sites. React Query
  // dedupes concurrent requests, cancels stale fetches on key change, and
  // refetches on focus/reconnect — all of which the previous code did wrong.
  const songsFilters: SongsFilters = useMemo(() => ({
    q: debouncedSearch || undefined,
    status: statusFilter || undefined,
    minRating: ratingFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy: sortBy || undefined,
    tagIds: tagFilter.length > 0 ? tagFilter : undefined,
    smartFilter: smartFilter && smartFilter !== "archived" ? smartFilter : undefined,
    archived: smartFilter === "archived" || undefined,
    genre: genreFilter.length > 0 ? genreFilter : undefined,
    mood: moodFilter.length > 0 ? moodFilter : undefined,
    tempoMin: tempoMin || undefined,
    tempoMax: tempoMax || undefined,
    includeVariations: includeVariations || undefined,
  }), [debouncedSearch, statusFilter, ratingFilter, dateFrom, dateTo, sortBy, tagFilter, smartFilter, genreFilter, moodFilter, tempoMin, tempoMax, includeVariations]);

  const songsQuery = useSongsList(songsFilters, {
    enabled: enableServerSearch,
    pollWhilePending: enableServerSearch,
  });

  // Sync query data → local songs state. Local state is preserved so
  // optimistic mutations (favorite toggle, retry, batch ops) keep working
  // via setSongs without needing to reshape the infinite-query cache.
  useEffect(() => {
    if (!songsQuery.data) return;
    const allSongs = songsQuery.data.pages.flatMap((p) => p.songs);
    setSongs(allSongs);
    const lastPage = songsQuery.data.pages.at(-1);
    setNextCursor(lastPage?.nextCursor ?? null);
    setTotalSongs(lastPage?.total ?? allSongs.length);
  }, [songsQuery.data]);

  // Spinner while we have no data for the current filter set; cached data
  // for previously-seen filters appears instantly without a flash.
  useEffect(() => {
    setLoading(songsQuery.isPending && songs.length === 0);
  }, [songsQuery.isPending, songs.length]);

  useEffect(() => {
    setLoadingMore(songsQuery.isFetchingNextPage);
  }, [songsQuery.isFetchingNextPage]);

  const handleLoadMore = useCallback(() => {
    if (!songsQuery.hasNextPage || songsQuery.isFetchingNextPage) return;
    songsQuery.fetchNextPage();
  }, [songsQuery]);

  // Pull-to-refresh just calls refetch — React Query handles the rest.
  const handleLibraryRefreshRef = useRef<() => Promise<void>>(async () => {});
  const handleLibraryRefresh = useCallback(async () => {
    await songsQuery.refetch();
  }, [songsQuery]);

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

  type BatchActionType = Exclude<LibraryBatchAction, "tag" | "add_to_playlist">;

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
      const result = await runSongsBatchAction({ action, songIds });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      const count = result.affected;

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
      const result = await runSongsBatchAction({ action, songIds: [song.id] });
      if (!result.ok) {
        toast(result.error, "error");
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
      const result = await runSongsBatchAction({
        action: "permanent_delete",
        songIds: [song.id],
      });
      if (!result.ok) {
        toast(result.error || "Delete failed", "error");
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

  useOutsideClick(batchTagMenuRef, () => setShowBatchTagMenu(false), showBatchTagMenu);

  useOutsideClick(batchPlaylistMenuRef, () => setShowBatchPlaylistMenu(false), showBatchPlaylistMenu);

  useOutsideClick(
    batchDownloadFormatMenuRef,
    () => setShowBatchDownloadFormatMenu(false),
    showBatchDownloadFormatMenu
  );

  async function handleBatchTag(tagId: string) {
    setShowBatchTagMenu(false);
    if (selectedSongIds.size === 0) return;
    setBatchTagLoading(true);
    try {
      const result = await runSongsBatchAction({
        action: "tag",
        songIds: Array.from(selectedSongIds),
        tagId,
      });
      if (!result.ok) {
        toast(result.error || "Batch tag failed", "error");
        return;
      }
      toast(`Tagged ${result.affected} song${result.affected !== 1 ? "s" : ""}`, "success");
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
      const result = await runSongsBatchAction({
        action: "add_to_playlist",
        songIds: Array.from(selectedSongIds),
        playlistId,
      });
      if (!result.ok) {
        toast(result.error || "Batch add to playlist failed", "error");
        return;
      }
      toast(`Added ${result.affected} song${result.affected !== 1 ? "s" : ""} to playlist`, "success");
      clearSelection();
    } catch {
      toast("Batch add to playlist failed", "error");
    } finally {
      setBatchPlaylistLoading(false);
    }
  }

  async function openBatchPlaylistMenu() {
    setShowBatchPlaylistMenu(true);
    const playlists = await fetchPlaylistOptions();
    if (playlists.length > 0) {
      setBatchPlaylists(playlists);
    }
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div
            ref={batchDeleteDialogRef}
            tabIndex={-1}
            className="bg-white dark:bg-gray-900 w-full sm:rounded-2xl rounded-t-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 sm:mx-4 sm:max-w-sm"
          >
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
        >
          <div
            ref={pendingDeleteDialogRef}
            tabIndex={-1}
            className="bg-white dark:bg-gray-900 w-full sm:rounded-2xl rounded-t-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 sm:mx-4 sm:max-w-sm"
          >
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
