"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PlayIcon,
  PauseIcon,
  MagnifyingGlassIcon,
  MusicalNoteIcon,
  FireIcon,
  TrophyIcon,
  GlobeAltIcon,
  XMarkIcon,
  SparklesIcon,
} from "@heroicons/react/24/solid";
import { FollowButton } from "@/components/FollowButton";
import { AddToPlaylistButton } from "@/components/AddToPlaylistButton";

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
  user: { id: string; name: string | null; username: string | null };
}

interface TrendingSong {
  id: string;
  title: string | null;
  genre: string | null;
  albumArtUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  playCount: number;
  publicSlug: string | null;
  createdAt: string;
  score: number;
  creatorDisplayName: string;
  creatorUsername: string | null;
}

interface PublicSong {
  id: string;
  title: string | null;
  creatorDisplayName: string;
  creatorUserId: string;
  creatorUsername: string | null;
  albumArtUrl: string | null;
  audioUrl: string | null;
  publicSlug: string | null;
  duration: number | null;
  genre: string | null;
  playCount: number;
  createdAt: string;
}

interface PublicPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface DiscoverPagination {
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

interface TrendingPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

type Tab = "for_you" | "browse" | "trending" | "popular";

interface FeedSong {
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
  creatorDisplayName: string;
  creatorUsername: string | null;
  creatorUserId: string;
  reason: "recommended" | "followed_artist" | "trending" | "new_release";
  reasonLabel: string;
}

interface FeedPagination {
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

const TEMPO_PRESETS = [
  { label: "Slow", min: 0, max: 80 },
  { label: "Medium", min: 81, max: 120 },
  { label: "Fast", min: 121, max: 999 },
] as const;

const FALLBACK_GENRE_TAGS = [
  "Pop", "Rock", "Hip-Hop", "Electronic", "Jazz",
  "Classical", "R&B", "Country", "Lo-Fi", "Ambient",
  "Metal", "Folk", "Indie", "Funk", "Soul",
];

const FALLBACK_MOOD_TAGS = [
  "Energetic", "Chill", "Dark", "Uplifting", "Melancholic",
  "Dreamy", "Epic", "Relaxed", "Happy", "Romantic",
];

function formatDuration(seconds: number | null): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors min-h-[44px] ${
        active
          ? "bg-violet-100 dark:bg-violet-900/50 border-violet-400 dark:border-violet-600 text-violet-700 dark:text-violet-300"
          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
      }`}
    >
      {label}
    </button>
  );
}

function ActiveFilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 text-xs font-medium rounded-full bg-violet-100 dark:bg-violet-900/50 border border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300">
      {label}
      <button
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors"
      >
        <XMarkIcon className="w-3 h-3" />
      </button>
    </span>
  );
}

const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: "for_you", label: "For You", icon: SparklesIcon },
  { value: "browse", label: "Browse", icon: GlobeAltIcon },
  { value: "trending", label: "Trending", icon: FireIcon },
  { value: "popular", label: "Popular", icon: TrophyIcon },
];

export function DiscoverView({
  basePath = "/discover",
  initialSongs,
  initialPagination,
  defaultTab = "for_you",
}: {
  basePath?: string;
  initialSongs?: DiscoverSong[];
  initialPagination?: DiscoverPagination;
  defaultTab?: Tab;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Tracks whether we should skip the initial browse fetch because SSR data is pre-loaded
  const skipInitialBrowseFetch = useRef(!!initialSongs && defaultTab === "browse");

  // Tab state
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return (t === "trending" || t === "popular" || t === "browse" || t === "for_you") ? t : defaultTab;
  });

  // Browse tab state
  const [songs, setSongs] = useState<DiscoverSong[]>(initialSongs ?? []);
  const [pagination, setPagination] = useState<DiscoverPagination>(
    initialPagination ?? { page: 1, totalPages: 1, total: 0, hasMore: false }
  );
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "newest");
  const [tag, setTag] = useState(searchParams.get("tag") || "");
  const [mood, setMood] = useState(searchParams.get("mood") || "");
  const [tempoPreset, setTempoPreset] = useState<string>(
    searchParams.get("tempo") || ""
  );

  // Trending/Popular tab state
  const [trendingSongs, setTrendingSongs] = useState<TrendingSong[]>([]);
  const [trendingPagination, setTrendingPagination] = useState<TrendingPagination>({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  });

  // For You feed state
  const [feedSongs, setFeedSongs] = useState<FeedSong[]>([]);
  const [feedPagination, setFeedPagination] = useState<FeedPagination>({
    page: 1,
    totalPages: 1,
    total: 0,
    hasMore: false,
  });
  const [feedTag, setFeedTag] = useState(searchParams.get("feedTag") || "");
  const [feedMood, setFeedMood] = useState(searchParams.get("feedMood") || "");
  const feedSentinelRef = useRef<HTMLDivElement>(null);
  const [trendingOffset, setTrendingOffset] = useState(0);
  const [trendingGenre, setTrendingGenre] = useState("");
  const [trendingMood, setTrendingMood] = useState("");

  // Search state
  const [searchInputValue, setSearchInputValue] = useState(
    searchParams.get("q") || ""
  );
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [searchResults, setSearchResults] = useState<PublicSong[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPagination, setSearchPagination] = useState<PublicPagination>({
    total: 0, limit: 20, offset: 0, hasMore: false,
  });
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared state
  const [loading, setLoading] = useState(initialSongs ? false : true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [genreTags, setGenreTags] = useState<string[]>([]);
  const [moodTags, setMoodTags] = useState<string[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchSentinelRef = useRef<HTMLDivElement>(null);

  // Sync tab/filters/search to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) {
      params.set("q", searchQuery);
    } else {
      if (tab !== "for_you") params.set("tab", tab);
      if (tab === "browse") {
        if (sortBy !== "newest") params.set("sortBy", sortBy);
        if (tag) params.set("tag", tag);
        if (mood) params.set("mood", mood);
        if (tempoPreset) params.set("tempo", tempoPreset);
      } else if (tab === "for_you") {
        if (feedTag) params.set("feedTag", feedTag);
        if (feedMood) params.set("feedMood", feedMood);
      }
    }
    const qs = params.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }, [tab, sortBy, tag, mood, tempoPreset, feedTag, feedMood, searchQuery, router, basePath]);

  const tempoRange = TEMPO_PRESETS.find((p) => p.label === tempoPreset);

  // Fetch browse songs
  const fetchSongs = useCallback(
    async (
      page: number,
      sort: string,
      genre: string,
      moodVal: string,
      tempoMin: number | null,
      tempoMax: number | null,
      append = false
    ) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), sortBy: sort });
        if (genre) params.set("tag", genre);
        if (moodVal) params.set("mood", moodVal);
        if (tempoMin !== null) params.set("tempoMin", String(tempoMin));
        if (tempoMax !== null) params.set("tempoMax", String(tempoMax));
        const res = await fetch(`/api/songs/discover?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setSongs((prev) => (append ? [...prev, ...data.songs] : data.songs));
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

  // Fetch trending/popular songs
  const fetchTrending = useCallback(
    async (
      sort: "trending" | "popular",
      genre: string,
      moodVal: string,
      offset: number,
      append = false
    ) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({ sort, limit: "20", offset: String(offset) });
        if (genre) params.set("genre", genre);
        if (moodVal) params.set("mood", moodVal);
        const res = await fetch(`/api/songs/trending?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setTrendingSongs((prev) => (append ? [...prev, ...data.songs] : data.songs));
        setTrendingPagination(data.pagination);
      } catch {
        // keep existing state
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    []
  );

  // Fetch personalized feed
  const fetchFeed = useCallback(
    async (page: number, tagVal: string, moodVal: string, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const p = new URLSearchParams({ page: String(page) });
        if (tagVal) p.set("tag", tagVal);
        if (moodVal) p.set("mood", moodVal);
        const res = await fetch(`/api/discover?${p}`);
        if (!res.ok) return;
        const data = await res.json();
        setFeedSongs((prev) => (append ? [...prev, ...data.feed] : data.feed));
        setFeedPagination(data.pagination);
      } catch {
        // keep existing state
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    []
  );

  // Fetch search results from /api/songs/public
  const fetchSearch = useCallback(
    async (q: string, offset: number, append = false) => {
      if (append) setLoadingMore(true);
      else setSearchLoading(true);
      try {
        const params = new URLSearchParams({ q, limit: "20", offset: String(offset) });
        const res = await fetch(`/api/songs/public?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setSearchResults((prev) => (append ? [...prev, ...data.songs] : data.songs));
        setSearchPagination(data.pagination);
      } catch {
        // keep existing state
      } finally {
        if (append) setLoadingMore(false);
        else setSearchLoading(false);
      }
    },
    []
  );

  // Trigger search when searchQuery changes
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }
    setSearchResults([]);
    fetchSearch(searchQuery, 0);
  }, [searchQuery, fetchSearch]);

  // Fetch on browse tab changes
  useEffect(() => {
    if (tab !== "browse") return;
    // Skip the first fetch when SSR pre-loaded data is provided for the default state
    if (skipInitialBrowseFetch.current) {
      skipInitialBrowseFetch.current = false;
      return;
    }
    setSongs([]);
    fetchSongs(
      1,
      sortBy,
      tag,
      mood,
      tempoRange?.min ?? null,
      tempoRange?.max ?? null
    );
  }, [tab, sortBy, tag, mood, tempoRange, fetchSongs]);

  // Fetch on trending/popular tab changes
  useEffect(() => {
    if (tab !== "trending" && tab !== "popular") return;
    setTrendingSongs([]);
    setTrendingOffset(0);
    fetchTrending(tab, trendingGenre, trendingMood, 0);
  }, [tab, trendingGenre, trendingMood, fetchTrending]);

  // Fetch on "for_you" tab + filter changes
  useEffect(() => {
    if (tab !== "for_you") return;
    setFeedSongs([]);
    fetchFeed(1, feedTag, feedMood);
  }, [tab, feedTag, feedMood, fetchFeed]);

  // Load genre and mood tag lists
  useEffect(() => {
    let cancelled = false;
    setLoadingFilters(true);
    Promise.all([
      fetch("/api/songs/genres")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/songs/moods")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([genreData, moodData]) => {
      if (cancelled) return;
      const genres: string[] =
        genreData?.genres?.map((g: { name: string }) => g.name) ??
        FALLBACK_GENRE_TAGS;
      const moods: string[] =
        moodData?.moods?.map((m: { name: string }) => m.name) ??
        FALLBACK_MOOD_TAGS;
      setGenreTags(genres.length > 0 ? genres : FALLBACK_GENRE_TAGS);
      setMoodTags(moods.length > 0 ? moods : FALLBACK_MOOD_TAGS);
      setLoadingFilters(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Infinite scroll for browse tab
  useEffect(() => {
    if (tab !== "browse") return;
    const sentinel = sentinelRef.current;
    if (!sentinel || !pagination.hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchSongs(
            pagination.page + 1,
            sortBy,
            tag,
            mood,
            tempoRange?.min ?? null,
            tempoRange?.max ?? null,
            true
          );
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    tab,
    pagination.hasMore,
    pagination.page,
    loadingMore,
    sortBy,
    tag,
    mood,
    tempoRange,
    fetchSongs,
  ]);

  // Infinite scroll for trending/popular tabs
  useEffect(() => {
    if (tab !== "trending" && tab !== "popular") return;
    const sentinel = sentinelRef.current;
    if (!sentinel || !trendingPagination.hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          const nextOffset = trendingOffset + 20;
          setTrendingOffset(nextOffset);
          fetchTrending(tab, trendingGenre, trendingMood, nextOffset, true);
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    tab,
    trendingPagination.hasMore,
    trendingOffset,
    loadingMore,
    trendingGenre,
    trendingMood,
    fetchTrending,
  ]);

  // Infinite scroll for "for_you" feed
  useEffect(() => {
    if (tab !== "for_you") return;
    const sentinel = feedSentinelRef.current;
    if (!sentinel || !feedPagination.hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchFeed(feedPagination.page + 1, feedTag, feedMood, true);
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab, feedPagination.hasMore, feedPagination.page, loadingMore, feedTag, feedMood, fetchFeed]);

  // Infinite scroll for search results
  useEffect(() => {
    if (!searchQuery) return;
    const sentinel = searchSentinelRef.current;
    if (!sentinel || !searchPagination.hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          const nextOffset = searchPagination.offset + searchPagination.limit;
          fetchSearch(searchQuery, nextOffset, true);
          setSearchPagination((p) => ({ ...p, offset: nextOffset }));
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [searchQuery, searchPagination, loadingMore, fetchSearch]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingSongId(null);
  }, []);

  const handlePlayToggle = useCallback(
    (id: string, audioUrl: string | null) => {
      if (playingSongId === id) {
        audioRef.current?.pause();
        setPlayingSongId(null);
        return;
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (!audioUrl) return;
      const audio = new Audio(audioUrl);
      audio.volume = 0.7;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingSongId(null);
      audioRef.current = audio;
      setPlayingSongId(id);
    },
    [playingSongId]
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchInputValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(value.trim());
    }, 300);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInputValue("");
    setSearchQuery("");
    setSearchResults([]);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  const clearBrowseFilters = useCallback(() => {
    setTag("");
    setMood("");
    setTempoPreset("");
  }, []);

  const clearTrendingFilters = useCallback(() => {
    setTrendingGenre("");
    setTrendingMood("");
  }, []);

  // Stop playback when switching tabs
  const handleTabChange = useCallback(
    (newTab: Tab) => {
      stopPlayback();
      setTab(newTab);
    },
    [stopPlayback]
  );

  const browseFilterCount =
    (tag ? 1 : 0) + (mood ? 1 : 0) + (tempoPreset ? 1 : 0);
  const trendingFilterCount =
    (trendingGenre ? 1 : 0) + (trendingMood ? 1 : 0);

  const totalCount =
    tab === "browse"
      ? pagination.total
      : tab === "for_you"
      ? feedPagination.total
      : trendingPagination.total;

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
                {tab === "for_you"
                  ? "Your personalized discover feed"
                  : `Explore ${totalCount} publicly shared songs`}
              </p>
            </div>
            <Link
              href="/auth/signin"
              className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              Sign in
            </Link>
          </div>

          {/* Search bar */}
          <div className="relative mt-3">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={searchInputValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search songs, artists, genres..."
              className="w-full pl-9 pr-9 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent placeholder:text-gray-400"
              aria-label="Search public songs"
            />
            {searchInputValue && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Clear search"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Tab navigation — hidden during search */}
          {!searchQuery && (
            <div className="flex gap-1 mt-3">
              {TABS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => handleTabChange(value)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[36px] ${
                    tab === value
                      ? "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* Search results */}
        {searchQuery && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {searchLoading
                  ? "Searching…"
                  : `${searchPagination.total} result${searchPagination.total !== 1 ? "s" : ""} for "${searchQuery}"`}
              </p>
            </div>
            {searchLoading ? (
              <SongGridSkeleton />
            ) : searchResults.length === 0 ? (
              <div className="text-center py-16">
                <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  No songs found. Try a different search.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {searchResults.map((song) => (
                  <SearchCard
                    key={song.id}
                    song={song}
                    isPlaying={playingSongId === song.id}
                    onPlayToggle={() => handlePlayToggle(song.id, song.audioUrl)}
                  />
                ))}
              </div>
            )}
            {searchPagination.hasMore && (
              <ScrollSentinel ref={searchSentinelRef} loading={loadingMore} />
            )}
          </>
        )}

        {!searchQuery && tab === "for_you" && (
          <>
            {/* Feed genre/mood filters */}
            <div className="flex flex-col gap-4">
              <section>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Genre
                </p>
                <div className="flex flex-wrap gap-2">
                  <FilterPill
                    label="All Genres"
                    active={feedTag === ""}
                    onClick={() => setFeedTag("")}
                  />
                  {loadingFilters
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-[44px] w-16 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse"
                        />
                      ))
                    : genreTags.map((g) => (
                        <FilterPill
                          key={g}
                          label={g}
                          active={feedTag === g}
                          onClick={() => setFeedTag(feedTag === g ? "" : g)}
                        />
                      ))}
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Mood
                </p>
                <div className="flex flex-wrap gap-2">
                  <FilterPill
                    label="Any Mood"
                    active={feedMood === ""}
                    onClick={() => setFeedMood("")}
                  />
                  {loadingFilters
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-[44px] w-16 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse"
                        />
                      ))
                    : moodTags.map((m) => (
                        <FilterPill
                          key={m}
                          label={m}
                          active={feedMood === m}
                          onClick={() => setFeedMood(feedMood === m ? "" : m)}
                        />
                      ))}
                </div>
              </section>
            </div>

            {/* Feed song grid */}
            {loading ? (
              <SongGridSkeleton />
            ) : feedSongs.length === 0 ? (
              <div className="text-center py-16">
                <SparklesIcon className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  No songs to show yet. Try a different filter or check back later.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {feedSongs.map((song) => (
                  <FeedCard
                    key={song.id}
                    song={song}
                    isPlaying={playingSongId === song.id}
                    onPlayToggle={() => handlePlayToggle(song.id, song.audioUrl)}
                    onTagClick={(t) => setFeedTag(t)}
                    onMoodClick={(m) => setFeedMood(m)}
                  />
                ))}
              </div>
            )}

            {feedPagination.hasMore && (
              <ScrollSentinel ref={feedSentinelRef} loading={loadingMore} />
            )}
          </>
        )}

        {!searchQuery && tab === "browse" && (
          <>
            {/* Sort + clear */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex items-center gap-2">
                <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Sort:
                </span>
                <div className="flex gap-1">
                  {SORT_OPTIONS.map((opt) => (
                    <FilterPill
                      key={opt.value}
                      label={opt.label}
                      active={sortBy === opt.value}
                      onClick={() => setSortBy(opt.value)}
                    />
                  ))}
                </div>
              </div>
              {browseFilterCount > 0 && (
                <button
                  onClick={clearBrowseFilters}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline shrink-0"
                >
                  Clear {browseFilterCount} filter{browseFilterCount > 1 ? "s" : ""}
                </button>
              )}
            </div>

            {/* Active filter chips */}
            {browseFilterCount > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Active filters">
                {tag && (
                  <ActiveFilterChip
                    label={`Genre: ${tag}`}
                    onRemove={() => setTag("")}
                  />
                )}
                {mood && (
                  <ActiveFilterChip
                    label={`Mood: ${mood}`}
                    onRemove={() => setMood("")}
                  />
                )}
                {tempoPreset && (
                  <ActiveFilterChip
                    label={`Tempo: ${tempoPreset}`}
                    onRemove={() => setTempoPreset("")}
                  />
                )}
              </div>
            )}

            {/* Genre filter */}
            <section>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Genre
              </p>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  label="All Genres"
                  active={tag === ""}
                  onClick={() => setTag("")}
                />
                {loadingFilters
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[44px] w-16 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse"
                      />
                    ))
                  : genreTags.map((g) => (
                      <FilterPill
                        key={g}
                        label={g}
                        active={tag === g}
                        onClick={() => setTag(tag === g ? "" : g)}
                      />
                    ))}
              </div>
            </section>

            {/* Mood filter */}
            <section>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Mood
              </p>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  label="Any Mood"
                  active={mood === ""}
                  onClick={() => setMood("")}
                />
                {loadingFilters
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[44px] w-16 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse"
                      />
                    ))
                  : moodTags.map((m) => (
                      <FilterPill
                        key={m}
                        label={m}
                        active={mood === m}
                        onClick={() => setMood(mood === m ? "" : m)}
                      />
                    ))}
              </div>
            </section>

            {/* Tempo filter */}
            <section>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Tempo
              </p>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  label="Any Tempo"
                  active={tempoPreset === ""}
                  onClick={() => setTempoPreset("")}
                />
                {TEMPO_PRESETS.map((preset) => (
                  <FilterPill
                    key={preset.label}
                    label={`${preset.label} (${
                      preset.label === "Slow"
                        ? "\u226480 BPM"
                        : preset.label === "Medium"
                        ? "81\u2013120 BPM"
                        : "121+ BPM"
                    })`}
                    active={tempoPreset === preset.label}
                    onClick={() =>
                      setTempoPreset(tempoPreset === preset.label ? "" : preset.label)
                    }
                  />
                ))}
              </div>
            </section>

            {/* Browse song grid */}
            {loading ? (
              <SongGridSkeleton />
            ) : songs.length === 0 ? (
              <EmptyState
                hasFilters={browseFilterCount > 0}
                onClear={clearBrowseFilters}
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {songs.map((song) => (
                  <DiscoverCard
                    key={song.id}
                    song={song}
                    isPlaying={playingSongId === song.id}
                    onPlayToggle={() =>
                      handlePlayToggle(song.id, song.audioUrl)
                    }
                    onTagClick={(t) => setTag(t)}
                    onMoodClick={(m) => setMood(m)}
                  />
                ))}
              </div>
            )}

            {/* Infinite scroll sentinel */}
            {pagination.hasMore && (
              <ScrollSentinel ref={sentinelRef} loading={loadingMore} />
            )}
          </>
        )}

        {!searchQuery && (tab === "trending" || tab === "popular") && (
          <>
            {/* Tab description */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {tab === "trending"
                  ? "Songs gaining momentum over the last 30 days, ranked by plays and recency."
                  : "All-time most-played public songs."}
              </p>
              {trendingFilterCount > 0 && (
                <button
                  onClick={clearTrendingFilters}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline shrink-0"
                >
                  Clear {trendingFilterCount} filter{trendingFilterCount > 1 ? "s" : ""}
                </button>
              )}
            </div>

            {/* Active filter chips for trending/popular */}
            {trendingFilterCount > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Active filters">
                {trendingGenre && (
                  <ActiveFilterChip
                    label={`Genre: ${trendingGenre}`}
                    onRemove={() => setTrendingGenre("")}
                  />
                )}
                {trendingMood && (
                  <ActiveFilterChip
                    label={`Mood: ${trendingMood}`}
                    onRemove={() => setTrendingMood("")}
                  />
                )}
              </div>
            )}

            {/* Genre filter for trending/popular */}
            <section>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Genre
              </p>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  label="All Genres"
                  active={trendingGenre === ""}
                  onClick={() => setTrendingGenre("")}
                />
                {loadingFilters
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[44px] w-16 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse"
                      />
                    ))
                  : genreTags.map((g) => (
                      <FilterPill
                        key={g}
                        label={g}
                        active={trendingGenre === g}
                        onClick={() =>
                          setTrendingGenre(trendingGenre === g ? "" : g)
                        }
                      />
                    ))}
              </div>
            </section>

            {/* Mood filter for trending/popular */}
            <section>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Mood
              </p>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  label="Any Mood"
                  active={trendingMood === ""}
                  onClick={() => setTrendingMood("")}
                />
                {loadingFilters
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[44px] w-16 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse"
                      />
                    ))
                  : moodTags.map((m) => (
                      <FilterPill
                        key={m}
                        label={m}
                        active={trendingMood === m}
                        onClick={() =>
                          setTrendingMood(trendingMood === m ? "" : m)
                        }
                      />
                    ))}
              </div>
            </section>

            {/* Trending song list */}
            {loading ? (
              <TrendingListSkeleton />
            ) : trendingSongs.length === 0 ? (
              <EmptyState
                hasFilters={trendingFilterCount > 0}
                onClear={clearTrendingFilters}
              />
            ) : (
              <div className="space-y-2">
                {trendingSongs.map((song, index) => (
                  <TrendingRow
                    key={song.id}
                    song={song}
                    rank={trendingOffset + index + 1}
                    isPlaying={playingSongId === song.id}
                    onPlayToggle={() =>
                      handlePlayToggle(song.id, song.audioUrl)
                    }
                    isTrending={tab === "trending"}
                  />
                ))}
              </div>
            )}

            {/* Infinite scroll sentinel for trending */}
            {trendingPagination.hasMore && (
              <ScrollSentinel ref={sentinelRef} loading={loadingMore} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SongGridSkeleton() {
  return (
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
  );
}

function TrendingListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl animate-pulse"
        >
          <div className="w-8 h-6 bg-gray-200 dark:bg-gray-800 rounded shrink-0" />
          <div className="w-12 h-12 bg-gray-200 dark:bg-gray-800 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
          </div>
          <div className="w-16 h-4 bg-gray-200 dark:bg-gray-800 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="text-center py-16">
      <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
      <p className="text-gray-500 dark:text-gray-400 text-sm">
        No songs found. Try a different filter.
      </p>
      {hasFilters && (
        <button
          onClick={onClear}
          className="mt-3 text-sm text-violet-600 dark:text-violet-400 hover:underline"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

import { forwardRef } from "react";

const ScrollSentinel = forwardRef<HTMLDivElement, { loading: boolean }>(
  function ScrollSentinel({ loading }, ref) {
    return (
      <div
        ref={ref}
        className="flex items-center justify-center py-6"
        aria-live="polite"
      >
        {loading && (
          <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading more...
          </span>
        )}
      </div>
    );
  }
);

// Mood keywords for client-side tag parsing
const MOOD_KEYWORDS_CLIENT = new Set([
  "energetic", "chill", "dark", "uplifting", "melancholic", "aggressive",
  "relaxed", "happy", "sad", "epic", "dreamy", "intense", "romantic",
  "mysterious", "peaceful", "angry", "nostalgic", "euphoric", "somber",
  "atmospheric", "hypnotic", "groovy", "emotional", "powerful", "calm",
]);

function parseSongTags(tagsStr: string | null): {
  genres: string[];
  moods: string[];
} {
  if (!tagsStr) return { genres: [], moods: [] };
  const parts = tagsStr
    .split(/[,;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const genres: string[] = [];
  const moods: string[] = [];
  for (const part of parts) {
    if (MOOD_KEYWORDS_CLIENT.has(part.toLowerCase())) {
      moods.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
    } else {
      genres.push(part.charAt(0).toUpperCase() + part.slice(1));
    }
  }
  return { genres: genres.slice(0, 3), moods: moods.slice(0, 2) };
}

const REASON_STYLES: Record<
  string,
  { bg: string; text: string }
> = {
  recommended: {
    bg: "bg-violet-600",
    text: "text-white",
  },
  followed_artist: {
    bg: "bg-emerald-600",
    text: "text-white",
  },
  trending: {
    bg: "bg-orange-500",
    text: "text-white",
  },
  new_release: {
    bg: "bg-sky-600",
    text: "text-white",
  },
};

function FeedCard({
  song,
  isPlaying,
  onPlayToggle,
  onTagClick,
  onMoodClick,
}: {
  song: FeedSong;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onTagClick: (tag: string) => void;
  onMoodClick: (mood: string) => void;
}) {
  const coverUrl = song.imageUrl || "/default-cover.png";
  const href = song.publicSlug ? `/s/${song.publicSlug}` : "#";
  const { genres, moods } = parseSongTags(song.tags);
  const reasonStyle = REASON_STYLES[song.reason] ?? REASON_STYLES.new_release;

  return (
    <div className="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-shadow hover:shadow-lg hover:shadow-violet-500/10">
      <Link href={href} className="block relative aspect-square">
        <Image
          src={coverUrl}
          alt={song.title || "Song cover"}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
          loading="lazy"
        />
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
        {song.duration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs font-medium bg-black/70 text-white rounded">
            {formatDuration(song.duration)}
          </span>
        )}
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
        {/* Reason badge */}
        <span
          className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-semibold rounded-full ${reasonStyle.bg} ${reasonStyle.text} truncate max-w-[120px]`}
          title={song.reasonLabel}
        >
          {song.reasonLabel}
        </span>
      </Link>

      <div className="p-3">
        <Link href={href}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            {song.title || "Untitled"}
          </h3>
        </Link>
        <div className="flex items-center justify-between mt-0.5">
          {song.creatorUsername ? (
            <Link href={`/u/${song.creatorUsername}`} className="text-xs text-gray-500 dark:text-gray-400 truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
              {song.creatorDisplayName}
            </Link>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {song.creatorDisplayName}
            </p>
          )}
          <div className="flex items-center flex-shrink-0">
            <AddToPlaylistButton songId={song.id} variant="icon" />
            <FollowButton userId={song.creatorUserId} />
          </div>
        </div>

        {(genres.length > 0 || moods.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => onTagClick(g)}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/60 transition-colors"
                title={`Filter by genre: ${g}`}
              >
                {g}
              </button>
            ))}
            {moods.map((m) => (
              <button
                key={m}
                onClick={() => onMoodClick(m)}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/60 transition-colors"
                title={`Filter by mood: ${m}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
          {song.rating !== null && (
            <span className="flex items-center gap-0.5">
              <span className="text-yellow-500">&#9733;</span>
              {song.rating}
            </span>
          )}
          {song.playCount > 0 && <span>{song.playCount} plays</span>}
        </div>
      </div>
    </div>
  );
}

function DiscoverCard({
  song,
  isPlaying,
  onPlayToggle,
  onTagClick,
  onMoodClick,
}: {
  song: DiscoverSong;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onTagClick: (tag: string) => void;
  onMoodClick: (mood: string) => void;
}) {
  const coverUrl = song.imageUrl || "/default-cover.png";
  const href = song.publicSlug ? `/s/${song.publicSlug}` : "#";
  const { genres, moods } = parseSongTags(song.tags);

  return (
    <div className="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-shadow hover:shadow-lg hover:shadow-violet-500/10">
      <Link href={href} className="block relative aspect-square">
        <Image
          src={coverUrl}
          alt={song.title || "Song cover"}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
          loading="lazy"
        />
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
        {song.duration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs font-medium bg-black/70 text-white rounded">
            {formatDuration(song.duration)}
          </span>
        )}
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

      <div className="p-3">
        <Link href={href}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            {song.title || "Untitled"}
          </h3>
        </Link>
        <div className="flex items-center justify-between mt-0.5">
          {song.user.username ? (
            <Link href={`/u/${song.user.username}`} className="text-xs text-gray-500 dark:text-gray-400 truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
              {song.user.name || song.user.username}
            </Link>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {song.user.name || "Unknown Artist"}
            </p>
          )}
          <div className="flex items-center flex-shrink-0">
            <AddToPlaylistButton songId={song.id} variant="icon" />
            <FollowButton userId={song.user.id} />
          </div>
        </div>

        {(genres.length > 0 || moods.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => onTagClick(g)}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/60 transition-colors"
                title={`Filter by genre: ${g}`}
              >
                {g}
              </button>
            ))}
            {moods.map((m) => (
              <button
                key={m}
                onClick={() => onMoodClick(m)}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/60 transition-colors"
                title={`Filter by mood: ${m}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
          {song.rating !== null && (
            <span className="flex items-center gap-0.5">
              <span className="text-yellow-500">&#9733;</span>
              {song.rating}
            </span>
          )}
          {song.playCount > 0 && <span>{song.playCount} plays</span>}
        </div>
      </div>
    </div>
  );
}

function SearchCard({
  song,
  isPlaying,
  onPlayToggle,
}: {
  song: PublicSong;
  isPlaying: boolean;
  onPlayToggle: () => void;
}) {
  const coverUrl = song.albumArtUrl || "/default-cover.png";
  const href = song.publicSlug ? `/s/${song.publicSlug}` : "#";
  const { genres, moods } = parseSongTags(song.genre);

  return (
    <div className="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-shadow hover:shadow-lg hover:shadow-violet-500/10">
      <Link href={href} className="block relative aspect-square">
        <Image
          src={coverUrl}
          alt={song.title || "Song cover"}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
          loading="lazy"
        />
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
        {song.duration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs font-medium bg-black/70 text-white rounded">
            {formatDuration(song.duration)}
          </span>
        )}
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

      <div className="p-3">
        <Link href={href}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            {song.title || "Untitled"}
          </h3>
        </Link>
        {song.creatorUsername ? (
          <Link href={`/u/${song.creatorUsername}`} className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5 hover:text-violet-600 dark:hover:text-violet-400 transition-colors block">
            {song.creatorDisplayName}
          </Link>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {song.creatorDisplayName}
          </p>
        )}

        {(genres.length > 0 || moods.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {genres.map((g) => (
              <span
                key={g}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
              >
                {g}
              </span>
            ))}
            {moods.map((m) => (
              <span
                key={m}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300"
              >
                {m}
              </span>
            ))}
          </div>
        )}

        {song.playCount > 0 && (
          <div className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
            {song.playCount} plays
          </div>
        )}
      </div>
    </div>
  );
}

function TrendingRow({
  song,
  rank,
  isPlaying,
  onPlayToggle,
  isTrending,
}: {
  song: TrendingSong;
  rank: number;
  isPlaying: boolean;
  onPlayToggle: () => void;
  isTrending: boolean;
}) {
  const coverUrl = song.albumArtUrl || "/default-cover.png";
  const href = song.publicSlug ? `/s/${song.publicSlug}` : "#";
  const { genres } = parseSongTags(song.genre);

  return (
    <div className="group flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl transition-shadow hover:shadow-md hover:shadow-violet-500/10">
      {/* Rank */}
      <span
        className={`w-7 text-center text-sm font-bold shrink-0 ${
          rank <= 3
            ? rank === 1
              ? "text-yellow-500"
              : rank === 2
              ? "text-gray-400"
              : "text-amber-600"
            : "text-gray-400 dark:text-gray-500"
        }`}
      >
        {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank}
      </span>

      {/* Cover + play */}
      <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
        <Link href={href}>
          <Image
            src={coverUrl}
            alt={song.title || "Song cover"}
            fill
            sizes="48px"
            className="object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            {song.audioUrl && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPlayToggle();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow min-h-[32px] min-w-[32px]"
                aria-label={isPlaying ? "Pause" : "Play preview"}
              >
                {isPlaying ? (
                  <PauseIcon className="w-4 h-4" />
                ) : (
                  <PlayIcon className="w-4 h-4 ml-0.5" />
                )}
              </button>
            )}
          </div>
        </Link>
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="flex gap-0.5">
              <span className="w-0.5 h-3 bg-violet-400 rounded-full animate-pulse" />
              <span className="w-0.5 h-2 bg-violet-400 rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-0.5 h-3.5 bg-violet-400 rounded-full animate-pulse [animation-delay:300ms]" />
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link href={href}>
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            {song.title || "Untitled"}
          </p>
        </Link>
        {song.creatorUsername ? (
          <Link href={`/u/${song.creatorUsername}`} className="text-xs text-gray-500 dark:text-gray-400 truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors block">
            {song.creatorDisplayName}
          </Link>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {song.creatorDisplayName}
          </p>
        )}
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {genres.slice(0, 2).map((g) => (
              <span
                key={g}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="text-right shrink-0 space-y-0.5">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {song.playCount.toLocaleString()} plays
        </p>
        {isTrending && (
          <p className="text-[10px] text-violet-500 dark:text-violet-400 font-medium">
            score {song.score.toFixed(1)}
          </p>
        )}
        {song.duration && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {formatDuration(song.duration)}
          </p>
        )}
      </div>
    </div>
  );
}
