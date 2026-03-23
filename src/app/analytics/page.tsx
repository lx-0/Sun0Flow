"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { AppShell } from "@/components/AppShell";
import {
  MusicalNoteIcon,
  HeartIcon,
  QueueListIcon,
  StarIcon,
  CheckCircleIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

const GenerationsBarChart = dynamic(
  () => import("@/components/analytics/UserAnalyticsCharts").then((mod) => mod.GenerationsBarChart),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" /> }
);

const GenrePieChart = dynamic(
  () => import("@/components/analytics/UserAnalyticsCharts").then((mod) => mod.GenrePieChart),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" /> }
);

const CreditUsageBarChart = dynamic(
  () => import("@/components/analytics/UserAnalyticsCharts").then((mod) => mod.CreditUsageBarChart),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" /> }
);

interface CreditUsageData {
  budget: number;
  creditsUsedThisMonth: number;
  creditsRemaining: number;
  generationsThisMonth: number;
  usagePercent: number;
  isLow: boolean;
  totalCreditsAllTime: number;
  totalGenerationsAllTime: number;
  dailyChart: Array<{ date: string; credits: number; count: number }>;
}

interface UserAnalytics {
  totalGenerations: number;
  completedGenerations: number;
  totalFavorites: number;
  totalPlaylists: number;
  averageRating: number | null;
  ratedSongsCount: number;
  genreBreakdown: Array<{ genre: string; count: number }>;
  topSongs: Array<{
    id: string;
    title: string | null;
    tags: string | null;
    downloadCount: number;
    rating: number | null;
    createdAt: string;
  }>;
  dailyGenerations: Array<{ date: string; count: number }>;
}


function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
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
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<UserAnalytics | null>(null);
  const [creditData, setCreditData] = useState<CreditUsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [analyticsRes, creditsRes] = await Promise.all([
        fetch("/api/analytics/user"),
        fetch("/api/credits"),
      ]);
      if (analyticsRes.ok) setData(await analyticsRes.json());
      if (creditsRes.ok) setCreditData(await creditsRes.json());
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
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Analytics</h1>
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
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Analytics</h1>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total Songs" value={data.totalGenerations} icon={MusicalNoteIcon} />
          <StatCard label="Completed" value={data.completedGenerations} icon={CheckCircleIcon} />
          <StatCard label="Favorites" value={data.totalFavorites} icon={HeartIcon} />
          <StatCard label="Playlists" value={data.totalPlaylists} icon={QueueListIcon} />
          <StatCard
            label="Avg Rating"
            value={data.averageRating !== null ? `${data.averageRating}\u2605` : "\u2014"}
            icon={StarIcon}
          />
          <StatCard label="Rated Songs" value={data.ratedSongsCount} icon={ChartBarIcon} />
        </div>

        {/* Credit Usage Widget */}
        {creditData && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                Credit Usage
              </h2>
              {creditData.isLow && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-full">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  Low Credits
                </span>
              )}
            </div>

            {/* Usage bar */}
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-gray-600 dark:text-gray-400">
                  {creditData.creditsUsedThisMonth} / {creditData.budget} credits used
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {creditData.creditsRemaining} remaining
                </span>
              </div>
              <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    creditData.isLow
                      ? "bg-amber-500"
                      : creditData.usagePercent > 50
                        ? "bg-violet-500"
                        : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(100, creditData.usagePercent)}%` }}
                />
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{creditData.generationsThisMonth}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Generations this month</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{creditData.creditsUsedThisMonth}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Credits used</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {creditData.generationsThisMonth > 0
                    ? Math.round(creditData.creditsUsedThisMonth / Math.max(1, new Date().getDate()))
                    : 0}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Daily average</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{creditData.totalCreditsAllTime}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">All-time credits</p>
              </div>
            </div>

            {/* Daily credit chart */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Daily Credit Usage
              </h3>
              <CreditUsageBarChart data={creditData.dailyChart} />
            </div>
          </div>
        )}

        {/* Generations chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Generations (Last 30 Days)
          </h2>
          <GenerationsBarChart data={data.dailyGenerations} />
        </div>

        {/* Genre breakdown */}
        {data.genreBreakdown.length > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Genre Breakdown
            </h2>
            <GenrePieChart data={data.genreBreakdown} />
          </div>
        )}

        {/* Top songs by downloads */}
        {data.topSongs.length > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Most Downloaded Songs
            </h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.topSongs.map((song, i) => (
                <div key={song.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-sm font-bold text-gray-400 w-5 text-right">
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
                      {song.downloadCount}
                    </p>
                    <p className="text-xs text-gray-500">downloads</p>
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
