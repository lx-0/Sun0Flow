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
} from "@heroicons/react/24/solid";
import { FollowButton } from "@/components/FollowButton";

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
  user: { id: string; name: string | null };
}

interface Pagination {
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

export function DiscoverView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [songs, setSongs] = useState<DiscoverSong[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    totalPages: 1,
    total: 0,
    hasMore: false,
  });
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "newest");
  const [tag, setTag] = useState(searchParams.get("tag") || "");
  const [mood, setMood] = useState(searchParams.get("mood") || "");
  const [tempoPreset, setTempoPreset] = useState<string>(
    searchParams.get("tempo") || ""
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [genreTags, setGenreTags] = useState<string[]>([]);
  const [moodTags, setMoodTags] = useState<string[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Sync active filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (sortBy !== "newest") params.set("sortBy", sortBy);
    if (tag) params.set("tag", tag);
    if (mood) params.set("mood", mood);
    if (tempoPreset) params.set("tempo", tempoPreset);
    const qs = params.toString();
    router.replace(qs ? `/discover?${qs}` : "/discover", { scroll: false });
  }, [sortBy, tag, mood, tempoPreset, router]);

  const tempoRange = TEMPO_PRESETS.find((p) => p.label === tempoPreset);

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

  useEffect(() => {
    setSongs([]);
    fetchSongs(
      1,
      sortBy,
      tag,
      mood,
      tempoRange?.min ?? null,
      tempoRange?.max ?? null
    );
  }, [sortBy, tag, mood, tempoRange, fetchSongs]);

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

  // Infinite scroll
  useEffect(() => {
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
    pagination.hasMore,
    pagination.page,
    loadingMore,
    sortBy,
    tag,
    mood,
    tempoRange,
    fetchSongs,
  ]);

  const handlePlayToggle = useCallback(
    (song: DiscoverSong) => {
      if (playingSongId === song.id) {
        audioRef.current?.pause();
        setPlayingSongId(null);
        return;
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (!song.audioUrl) return;
      const audio = new Audio(song.audioUrl);
      audio.volume = 0.7;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingSongId(null);
      audioRef.current = audio;
      setPlayingSongId(song.id);
    },
    [playingSongId]
  );

  const clearFilters = useCallback(() => {
    setTag("");
    setMood("");
    setTempoPreset("");
  }, []);

  const activeFilterCount =
    (tag ? 1 : 0) + (mood ? 1 : 0) + (tempoPreset ? 1 : 0);

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
                Explore {pagination.total} publicly shared songs
              </p>
            </div>
            <Link
              href="/auth/signin"
              className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
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
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline shrink-0"
            >
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
            </button>
          )}
        </div>

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

        {/* Song grid */}
        {loading ? (
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
        ) : songs.length === 0 ? (
          <div className="text-center py-16">
            <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No songs found. Try a different filter.
            </p>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="mt-3 text-sm text-violet-600 dark:text-violet-400 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {songs.map((song) => (
              <DiscoverCard
                key={song.id}
                song={song}
                isPlaying={playingSongId === song.id}
                onPlayToggle={() => handlePlayToggle(song)}
                onTagClick={(t) => setTag(t)}
                onMoodClick={(m) => setMood(m)}
              />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        {pagination.hasMore && (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center py-6"
            aria-live="polite"
          >
            {loadingMore && (
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
        )}
      </main>
    </div>
  );
}

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
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {song.user.name || "Unknown Artist"}
          </p>
          <FollowButton userId={song.user.id} />
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
