"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { AppShell } from "@/components/AppShell";
import {
  MusicalNoteIcon,
  ClockIcon,
  FireIcon,
  CheckCircleIcon,
  SparklesIcon,
  ChartBarIcon,
  BoltIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";

const ListeningTimeChart = dynamic(
  () => import("@/components/analytics/StatsCharts").then((m) => m.ListeningTimeChart),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" /> }
);

const PeakHoursChart = dynamic(
  () => import("@/components/analytics/StatsCharts").then((m) => m.PeakHoursChart),
  { ssr: false, loading: () => <div className="h-[140px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" /> }
);

const StatsCreditChart = dynamic(
  () => import("@/components/analytics/StatsCharts").then((m) => m.StatsCreditChart),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" /> }
);

interface UserStats {
  totalSongsGenerated: number;
  completedGenerations: number;
  successRate: number;
  totalListeningTimeSec: number;
  songsThisWeek: number;
  songsLastWeek: number;
  songsThisMonth: number;
  songsLastMonth: number;
  weekTrend: number;
  monthTrend: number;
  playCountThisWeek: number;
  mostPlayedSongs: Array<{
    id: string;
    title: string | null;
    tags: string | null;
    playCount: number;
    duration: number | null;
    imageUrl: string | null;
    createdAt: string;
  }>;
  favoriteGenres: Array<{ genre: string; count: number }>;
  dailyListeningTime: Array<{ date: string; seconds: number; minutes: number }>;
  peakHours: Array<{ hour: number; count: number }>;
  currentStreak: number;
  longestStreak: number;
  creditUsageByDay: Array<{ date: string; credits: number; count: number }>;
  totalCreditsUsed: number;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function TrendBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-gray-400">same as last</span>;
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center text-xs font-medium ${
        positive ? "text-green-500" : "text-red-400"
      }`}
    >
      {positive ? "▲" : "▼"} {Math.abs(value)}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </span>
        <Icon className={`w-4 h-4 ${accent ?? "text-gray-400 dark:text-gray-500"}`} />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

export default function StatsPage() {
  const [data, setData] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/stats/user");
      if (res.ok) setData(await res.json());
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <AppShell>
        <div className="px-4 py-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">My Stats</h1>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-400" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="px-4 py-6">
          <p className="text-red-400">Failed to load stats</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-4 py-6 space-y-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">My Stats</h1>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Songs Generated"
            value={data.totalSongsGenerated}
            icon={MusicalNoteIcon}
            sub={<TrendBadge value={data.monthTrend} />}
          />
          <StatCard
            label="Listening Time"
            value={formatDuration(data.totalListeningTimeSec)}
            icon={ClockIcon}
            accent="text-cyan-500"
          />
          <StatCard
            label="Success Rate"
            value={`${data.successRate}%`}
            icon={CheckCircleIcon}
            accent="text-green-500"
          />
          <StatCard
            label="This Week"
            value={data.songsThisWeek}
            icon={CalendarDaysIcon}
            sub={<TrendBadge value={data.weekTrend} />}
          />
          <StatCard
            label="Current Streak"
            value={`${data.currentStreak}d`}
            icon={FireIcon}
            accent="text-orange-500"
            sub={
              <span className="text-xs text-gray-400">Best: {data.longestStreak}d</span>
            }
          />
          <StatCard
            label="Credits Used"
            value={data.totalCreditsUsed}
            icon={BoltIcon}
            accent="text-amber-500"
          />
        </div>

        {/* Most-played songs */}
        {data.mostPlayedSongs.length > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <ChartBarIcon className="w-4 h-4 text-violet-500" />
              Most-Played Songs
            </h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.mostPlayedSongs.map((song, i) => (
                <div key={song.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-sm font-bold text-gray-400 w-5 text-right flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {song.title ?? "Untitled"}
                    </p>
                    {song.tags && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {song.tags}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {song.playCount}
                    </p>
                    <p className="text-xs text-gray-500">plays</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Listening time chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
            <ClockIcon className="w-4 h-4 text-cyan-500" />
            Daily Listening Time (Last 30 Days)
          </h2>
          <ListeningTimeChart data={data.dailyListeningTime} />
        </div>

        {/* Peak listening hours */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-amber-500" />
            Peak Listening Hours
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            When you listen most throughout the day
          </p>
          <PeakHoursChart data={data.peakHours} />
        </div>

        {/* Favorite genres */}
        {data.favoriteGenres.length > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <SparklesIcon className="w-4 h-4 text-violet-500" />
              Favorite Genres &amp; Styles
            </h2>
            <div className="flex flex-wrap gap-2">
              {data.favoriteGenres.map((g, i) => {
                const colors = [
                  "#7c3aed", "#06b6d4", "#f59e0b", "#10b981", "#ef4444",
                  "#8b5cf6", "#3b82f6", "#ec4899", "#14b8a6", "#f97316",
                ];
                const color = colors[i % colors.length];
                return (
                  <span
                    key={g.genre}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{
                      backgroundColor: `${color}20`,
                      color,
                    }}
                  >
                    {g.genre}
                    <span className="opacity-60 text-xs">{g.count}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Generation insights */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
            <MusicalNoteIcon className="w-4 h-4 text-violet-500" />
            Generation Insights
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {data.totalSongsGenerated}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total generated</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {data.completedGenerations}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {data.successRate}%
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Success rate</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {data.songsThisMonth}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">This month</p>
            </div>
          </div>
        </div>

        {/* Credit usage chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
            <BoltIcon className="w-4 h-4 text-amber-500" />
            Credit Usage (Last 30 Days)
          </h2>
          <StatsCreditChart data={data.creditUsageByDay} />
        </div>
      </div>
    </AppShell>
  );
}
