"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { MusicalNoteIcon, SparklesIcon } from "@heroicons/react/24/solid";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalSongs: number;
  totalFavorites: number;
  totalPlaylists: number;
  songsThisWeek: number;
  songsThisMonth: number;
  averageRating: number | null;
  ratedSongsCount: number;
  topTags: { tag: string; count: number }[];
  recentSongs: {
    id: string;
    title: string | null;
    imageUrl: string | null;
    tags: string | null;
    duration: number | null;
    createdAt: string;
  }[];
}

interface RateLimitStatusFull {
  remaining: number;
  limit: number;
  used: number;
  percentUsed: number;
  resetAt: string;
  dailyCounts: { date: string; count: number }[];
}

// ─── Skeleton components ─────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-5 animate-pulse">
      <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-7 w-12 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
    </div>
  );
}

function RecentSongSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3 animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

function TopTagsSkeleton() {
  return (
    <div className="flex flex-wrap gap-2 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-7 rounded-full bg-gray-200 dark:bg-gray-700" style={{ width: `${50 + i * 12}px` }} />
      ))}
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-5 ${href ? "hover:border-violet-400 transition-colors" : ""}`}>
      <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US");
}

// ─── Usage history chart ─────────────────────────────────────────────────────

function UsageChart({ dailyCounts, limit }: { dailyCounts: { date: string; count: number }[]; limit: number }) {
  const maxCount = Math.max(...dailyCounts.map((d) => d.count), 1);
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">Generation history (7 days)</h3>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-end gap-1.5 h-32">
          {dailyCounts.map((d) => {
            const heightPct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
            const dateObj = new Date(d.date + "T12:00:00");
            const dayName = dayLabels[dateObj.getDay()];
            const isToday = d.date === new Date().toISOString().slice(0, 10);
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{d.count}</span>
                <div
                  className={`w-full rounded-t-md transition-all ${
                    isToday ? "bg-violet-500" : "bg-violet-300 dark:bg-violet-700"
                  }`}
                  style={{ height: `${Math.max(heightPct, 4)}%` }}
                />
                <span className={`text-xs ${isToday ? "text-violet-600 dark:text-violet-400 font-semibold" : "text-gray-500 dark:text-gray-400"}`}>
                  {dayName}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Hourly limit: {limit}/hr</span>
          <span>Total: {dailyCounts.reduce((s, d) => s + d.count, 0)} generations</span>
        </div>
      </div>
    </div>
  );
}

function UsageChartSkeleton() {
  return (
    <div>
      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">Generation history (7 days)</h3>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 animate-pulse">
        <div className="flex items-end gap-1.5 h-32">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-t-md" style={{ height: `${20 + i * 8}%` }} />
              <div className="h-3 w-6 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Daily discovery types ────────────────────────────────────────────────────

interface DiscoverySong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  duration: number | null;
  createdAt: string;
  rating: number | null;
}

// ─── DashboardView ───────────────────────────────────────────────────────────

export function DashboardView({ userName }: { userName?: string | null }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatusFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailySongs, setDailySongs] = useState<DiscoverySong[] | null>(null);
  const [dailyLoading, setDailyLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, rlRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/rate-limit/status"),
      ]);
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (rlRes.ok) {
        setRateLimitStatus(await rlRes.json());
      }
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStats();
    fetch("/api/recommendations/daily")
      .then((r) => r.json())
      .then((data) => setDailySongs(data.songs ?? []))
      .catch(() => setDailySongs([]))
      .finally(() => setDailyLoading(false));
  }, [fetchStats]);

  // Revalidate on page focus
  useEffect(() => {
    const handleFocus = () => fetchStats();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchStats]);

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Greeting */}
      <div data-tour="welcome">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Welcome back{userName ? `, ${userName}` : ""}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Your Suno music hub</p>
      </div>

      {/* Quick stats */}
      {loading && !stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard label="Songs" value={String(stats.totalSongs)} href="/library" />
          <StatCard label="Favorites" value={String(stats.totalFavorites)} href="/favorites" />
          <StatCard label="Playlists" value={String(stats.totalPlaylists)} href="/playlists" />
          <StatCard label="This week" value={String(stats.songsThisWeek)} />
        </div>
      ) : null}

      {/* Extended stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard label="This month" value={String(stats.songsThisMonth)} />
          <StatCard
            label="Avg rating"
            value={
              stats.averageRating !== null
                ? `${stats.averageRating}\u2605`
                : "\u2014"
            }
          />
        </div>
      )}

      {/* Top tags */}
      {loading && !stats ? (
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">Top styles</h3>
          <TopTagsSkeleton />
        </div>
      ) : stats && stats.topTags.length > 0 ? (
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">Top styles</h3>
          <div className="flex flex-wrap gap-2">
            {stats.topTags.map((t) => (
              <span
                key={t.tag}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-sm font-medium"
              >
                {t.tag}
                <span className="text-xs text-violet-600 dark:text-violet-300">{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Usage history chart */}
      {loading && !rateLimitStatus ? (
        <UsageChartSkeleton />
      ) : rateLimitStatus ? (
        <UsageChart dailyCounts={rateLimitStatus.dailyCounts} limit={rateLimitStatus.limit} />
      ) : null}

      {/* Recent songs */}
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">Recent songs</h3>
        {loading && !stats ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            <RecentSongSkeleton />
            <RecentSongSkeleton />
            <RecentSongSkeleton />
          </div>
        ) : stats && stats.recentSongs.length > 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            {stats.recentSongs.map((song) => (
              <Link
                key={song.id}
                href={`/library/${song.id}`}
                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="relative w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {song.imageUrl ? (
                    <Image src={song.imageUrl} alt={song.title ?? "Song"} fill className="object-cover" sizes="40px" loading="lazy" />
                  ) : (
                    <MusicalNoteIcon className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {song.title ?? "Untitled"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {song.tags && <span className="truncate">{song.tags.split(",")[0].trim()}</span>}
                    {song.duration && <span>{formatTime(song.duration)}</span>}
                  </div>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {timeAgo(song.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">
            <MusicalNoteIcon className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
            <p className="text-gray-500 text-sm">
              No songs yet. Head to Generate to create your first track.
            </p>
            <Link
              href="/generate"
              className="inline-block mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Generate a song
            </Link>
          </div>
        )}
      </div>

      {/* Daily discovery */}
      {(dailyLoading || (dailySongs && dailySongs.length > 0)) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <SparklesIcon className="w-4 h-4 text-violet-500" />
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Daily discovery</h3>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            {dailyLoading ? (
              <>
                <RecentSongSkeleton />
                <RecentSongSkeleton />
                <RecentSongSkeleton />
              </>
            ) : (
              dailySongs!.map((song) => (
                <Link
                  key={song.id}
                  href={`/library/${song.id}`}
                  className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="relative w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {song.imageUrl ? (
                      <Image src={song.imageUrl} alt={song.title ?? "Song"} fill className="object-cover" sizes="40px" loading="lazy" />
                    ) : (
                      <MusicalNoteIcon className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {song.title ?? "Untitled"}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {song.tags && <span className="truncate">{song.tags.split(",")[0].trim()}</span>}
                      {song.duration != null && <span>{formatTime(song.duration)}</span>}
                    </div>
                  </div>
                  {song.rating != null && (
                    <span className="text-xs text-amber-700 dark:text-amber-400 flex-shrink-0">{song.rating}★</span>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
