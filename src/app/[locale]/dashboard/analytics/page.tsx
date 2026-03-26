"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AppShell } from "@/components/AppShell";
import {
  MusicalNoteIcon,
  UserGroupIcon,
  PlayIcon,
  ChatBubbleLeftIcon,
  ClockIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

const DailyPlaysLineChart = dynamic(
  () =>
    import("@/components/analytics/PlayAnalyticsCharts").then(
      (m) => m.DailyPlaysLineChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[180px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
    ),
  }
);

const TopSongsBarChart = dynamic(
  () =>
    import("@/components/analytics/PlayAnalyticsCharts").then(
      (m) => m.TopSongsBarChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[180px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
    ),
  }
);

interface OverviewData {
  totalPlays: number;
  uniqueListeners: number;
  avgListenDuration: number | null;
  topSongs7d: Array<{ id: string; title: string; plays: number }>;
  topSongs30d: Array<{ id: string; title: string; plays: number }>;
  topSongsAllTime: Array<{ id: string; title: string; plays: number }>;
  mostCommented: Array<{ id: string; title: string; comments: number }>;
  dailyPlays: Array<{ date: string; count: number }>;
}

type Period = "7d" | "30d" | "all";

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </span>
        <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function DashboardAnalyticsPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("30d");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/overview");
      if (res.ok) setData(await res.json());
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const topSongs =
    data == null
      ? []
      : period === "7d"
        ? data.topSongs7d
        : period === "30d"
          ? data.topSongs30d
          : data.topSongsAllTime;

  if (loading) {
    return (
      <AppShell>
        <div className="px-4 py-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Song Analytics
          </h1>
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
          <p className="text-red-400">Failed to load analytics</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Song Analytics</h1>
          <Link
            href="/analytics"
            className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
          >
            Credit analytics →
          </Link>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Plays"
            value={data.totalPlays.toLocaleString()}
            icon={PlayIcon}
          />
          <StatCard
            label="Unique Listeners"
            value={data.uniqueListeners.toLocaleString()}
            icon={UserGroupIcon}
          />
          <StatCard
            label="Avg Listen Time"
            value={formatDuration(data.avgListenDuration)}
            sub="per session"
            icon={ClockIcon}
          />
          <StatCard
            label="Songs Tracked"
            value={data.topSongsAllTime.length}
            icon={MusicalNoteIcon}
          />
        </div>

        {/* Daily plays chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Plays — Last 30 Days
          </h2>
          {data.dailyPlays.every((d) => d.count === 0) ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
              No plays recorded yet. Play events are tracked automatically when
              listeners play your songs.
            </p>
          ) : (
            <DailyPlaysLineChart data={data.dailyPlays} />
          )}
        </div>

        {/* Top songs */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
              Top Songs by Plays
            </h2>
            <div className="flex gap-1">
              {(["7d", "30d", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                    period === p
                      ? "bg-violet-600 text-white"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {p === "all" ? "All time" : p}
                </button>
              ))}
            </div>
          </div>

          {topSongs.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
              No data for this period.
            </p>
          ) : (
            <TopSongsBarChart
              data={topSongs.map((s) => ({
                title: s.title.length > 20 ? s.title.slice(0, 18) + "…" : s.title,
                plays: s.plays,
              }))}
            />
          )}

          {/* Song list with links */}
          {topSongs.length > 0 && (
            <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
              {topSongs.map((song, i) => (
                <div key={song.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-sm font-bold text-gray-400 w-5 text-right">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/songs/${song.id}`}
                      className="text-sm font-medium text-gray-900 dark:text-white hover:text-violet-600 dark:hover:text-violet-400 truncate block"
                    >
                      {song.title}
                    </Link>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {song.plays.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">plays</p>
                  </div>
                  <Link
                    href={`/dashboard/analytics/${song.id}`}
                    className="text-xs text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 flex-shrink-0"
                  >
                    <ChartBarIcon className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Most commented songs */}
        {data.mostCommented.some((s) => s.comments > 0) && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">
              Most Commented Songs
            </h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.mostCommented
                .filter((s) => s.comments > 0)
                .map((song, i) => (
                  <div key={song.id} className="flex items-center gap-3 py-2.5">
                    <span className="text-sm font-bold text-gray-400 w-5 text-right">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/songs/${song.id}`}
                        className="text-sm font-medium text-gray-900 dark:text-white hover:text-violet-600 dark:hover:text-violet-400 truncate block"
                      >
                        {song.title}
                      </Link>
                    </div>
                    <div className="text-right flex-shrink-0 flex items-center gap-1">
                      <ChatBubbleLeftIcon className="w-4 h-4 text-gray-400" />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {song.comments}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
