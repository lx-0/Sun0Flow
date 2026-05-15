"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  QueueListIcon,
  RectangleStackIcon,
  SparklesIcon,
  MusicalNoteIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";

import {
  FALLBACK_GENRE_TAGS,
  FALLBACK_MOOD_TAGS,
  SORT_OPTIONS,
  TEMPO_PRESETS,
} from "./discover-view.utils";
import {
  CollectionCard,
  DiscoverCard,
  FeedCard,
  PlaylistCard,
  SearchCard,
  TrendingRow,
} from "./discover-view.cards";
import {
  ActiveFilterChip,
  CollectionsGridSkeleton,
  EmptyState,
  FilterPill,
  PlaylistsGridSkeleton,
  ScrollSentinel,
  SongGridSkeleton,
  TABS,
  TrendingListSkeleton,
} from "./discover-view.components";
import type {
  CollectionPreview,
  DiscoverPagination,
  DiscoverPlaylist,
  DiscoverSong,
  FeedPagination,
  FeedSong,
  PlaylistDiscoverPagination,
  PublicPagination,
  PublicSong,
  Tab,
  TrendingPagination,
  TrendingSong,
} from "./discover-view.types";

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
    return (t === "trending" || t === "popular" || t === "browse" || t === "for_you" || t === "collections" || t === "playlists") ? t : defaultTab;
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

  // Collections tab state
  const [collections, setCollections] = useState<CollectionPreview[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const collectionsFetchedRef = useRef(false);

  // Playlists tab state
  const [playlists, setPlaylists] = useState<DiscoverPlaylist[]>([]);
  const [playlistsPagination, setPlaylistsPagination] = useState<PlaylistDiscoverPagination>({
    page: 1, limit: 20, totalPages: 1, total: 0, hasMore: false,
  });
  const [playlistsSort, setPlaylistsSort] = useState<string>("trending");
  const [playlistsGenre, setPlaylistsGenre] = useState("");
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const playlistsSentinelRef = useRef<HTMLDivElement>(null);

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
      } else if (tab === "playlists") {
        if (playlistsSort !== "trending") params.set("plSort", playlistsSort);
        if (playlistsGenre) params.set("plGenre", playlistsGenre);
      }
    }
    const qs = params.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }, [tab, sortBy, tag, mood, tempoPreset, feedTag, feedMood, playlistsSort, playlistsGenre, searchQuery, router, basePath]);

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

  // Fetch curated collections
  const fetchCollections = useCallback(async () => {
    setCollectionsLoading(true);
    try {
      const res = await fetch("/api/collections");
      if (!res.ok) return;
      const data = await res.json();
      setCollections(data.collections ?? []);
    } catch {
      // keep existing state
    } finally {
      setCollectionsLoading(false);
    }
  }, []);

  // Fetch discover playlists
  const fetchPlaylists = useCallback(
    async (page: number, sort: string, genre: string, append = false) => {
      if (append) setLoadingMore(true);
      else setPlaylistsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), sort });
        if (genre) params.set("genre", genre);
        const res = await fetch(`/api/playlists/discover?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setPlaylists((prev) => (append ? [...prev, ...data.playlists] : data.playlists));
        setPlaylistsPagination(data.pagination);
      } catch {
        // keep existing state
      } finally {
        if (append) setLoadingMore(false);
        else setPlaylistsLoading(false);
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

  // Fetch collections once when the tab is first visited
  useEffect(() => {
    if (tab !== "collections") return;
    if (collectionsFetchedRef.current) return;
    collectionsFetchedRef.current = true;
    fetchCollections();
  }, [tab, fetchCollections]);

  // Fetch on playlists tab changes
  useEffect(() => {
    if (tab !== "playlists") return;
    setPlaylists([]);
    fetchPlaylists(1, playlistsSort, playlistsGenre);
  }, [tab, playlistsSort, playlistsGenre, fetchPlaylists]);

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

  // Infinite scroll for playlists tab
  useEffect(() => {
    if (tab !== "playlists") return;
    const sentinel = playlistsSentinelRef.current;
    if (!sentinel || !playlistsPagination.hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchPlaylists(playlistsPagination.page + 1, playlistsSort, playlistsGenre, true);
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab, playlistsPagination.hasMore, playlistsPagination.page, loadingMore, playlistsSort, playlistsGenre, fetchPlaylists]);

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
                  : tab === "collections"
                  ? "Themed song collections curated from the community"
                  : tab === "playlists"
                  ? "Browse published playlists from the community"
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

        {!searchQuery && tab === "collections" && (
          <>
            {collectionsLoading ? (
              <CollectionsGridSkeleton />
            ) : collections.length === 0 ? (
              <div className="text-center py-16">
                <RectangleStackIcon className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  No collections available yet. Check back soon.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {collections.map((collection) => (
                  <CollectionCard key={collection.id} collection={collection} />
                ))}
              </div>
            )}
          </>
        )}

        {!searchQuery && tab === "playlists" && (
          <>
            {/* Sort + genre filter */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Sort:
                </span>
                <div className="flex gap-1">
                  {([
                    { value: "trending", label: "Trending" },
                    { value: "recent", label: "Recent" },
                    { value: "popular", label: "Most Played" },
                  ] as const).map((opt) => (
                    <FilterPill
                      key={opt.value}
                      label={opt.label}
                      active={playlistsSort === opt.value}
                      onClick={() => setPlaylistsSort(opt.value)}
                    />
                  ))}
                </div>
              </div>
              {playlistsGenre && (
                <button
                  onClick={() => setPlaylistsGenre("")}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline shrink-0"
                >
                  Clear filter
                </button>
              )}
            </div>

            {/* Active genre chip */}
            {playlistsGenre && (
              <div className="flex flex-wrap gap-2" aria-label="Active filters">
                <ActiveFilterChip
                  label={`Genre: ${playlistsGenre}`}
                  onRemove={() => setPlaylistsGenre("")}
                />
              </div>
            )}

            {/* Genre filter chips */}
            <section>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Genre
              </p>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  label="All Genres"
                  active={playlistsGenre === ""}
                  onClick={() => setPlaylistsGenre("")}
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
                        active={playlistsGenre === g}
                        onClick={() => setPlaylistsGenre(playlistsGenre === g ? "" : g)}
                      />
                    ))}
              </div>
            </section>

            {/* Playlists grid */}
            {playlistsLoading ? (
              <PlaylistsGridSkeleton />
            ) : playlists.length === 0 ? (
              <div className="text-center py-16">
                <QueueListIcon className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  No published playlists yet.
                </p>
                {playlistsGenre && (
                  <button
                    onClick={() => setPlaylistsGenre("")}
                    className="mt-3 text-sm text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {playlists.map((playlist) => (
                  <PlaylistCard key={playlist.id} playlist={playlist} />
                ))}
              </div>
            )}

            {playlistsPagination.hasMore && (
              <ScrollSentinel ref={playlistsSentinelRef} loading={loadingMore} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
