"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { AppShell } from "@/components/AppShell";
import {
  ArrowLeftIcon,
  PlayIcon,
  UserGroupIcon,
  ClockIcon,
  ChatBubbleLeftIcon,
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

const RetentionCurveChart = dynamic(
  () =>
    import("@/components/analytics/PlayAnalyticsCharts").then(
      (m) => m.RetentionCurveChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[160px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
    ),
  }
);

interface SongAnalytics {
  songId: string;
  title: string;
  totalPlays: number;
  trackedPlays: number;
  uniqueListeners: number;
  avgListenDuration: number | null;
  songDuration: number | null;
  totalComments: number;
  dailyPlays: Array<{ date: string; count: number }>;
  retentionCurve: Array<{ pct: number; count: number; rate: number }>;
}

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

export default function SongAnalyticsPage() {
  const params = useParams();
  const songId = params.songId as string;
  const [data, setData] = useState<SongAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/songs/${songId}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) setData(await res.json());
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, [songId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <AppShell>
        <div className="px-4 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-400" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (notFound || !data) {
    return (
      <AppShell>
        <div className="px-4 py-6 space-y-4">
          <Link
            href="/dashboard/analytics"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Back to analytics
          </Link>
          <p className="text-gray-500">Song not found.</p>
        </div>
      </AppShell>
    );
  }

  const retentionHasData = data.retentionCurve.some((r) => r.count > 0);
  const dropOffPct = retentionHasData
    ? data.retentionCurve.reduce(
        (best, r) =>
          r.rate < 50 && r.pct < best ? r.pct : best,
        100
      )
    : null;

  return (
    <AppShell>
      <div className="px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/dashboard/analytics"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-3"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Back to analytics
          </Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
            {data.title}
          </h1>
          {data.songDuration && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Song length: {formatDuration(data.songDuration)}
            </p>
          )}
        </div>

        {/* Stats */}
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
            sub={
              data.songDuration && data.avgListenDuration
                ? `${Math.round((data.avgListenDuration / data.songDuration) * 100)}% of song`
                : undefined
            }
            icon={ClockIcon}
          />
          <StatCard
            label="Comments"
            value={data.totalComments}
            icon={ChatBubbleLeftIcon}
          />
        </div>

        {/* Daily plays chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Play Trend — Last 30 Days
          </h2>
          {data.dailyPlays.every((d) => d.count === 0) ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
              No play events recorded for this song yet.
            </p>
          ) : (
            <DailyPlaysLineChart data={data.dailyPlays} />
          )}
        </div>

        {/* Listener retention curve */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
              Listener Retention
            </h2>
            {dropOffPct !== null && dropOffPct < 100 && (
              <span className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                Drop-off at {dropOffPct}%
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Percentage of listeners still playing at each point in the song.
          </p>
          {!retentionHasData ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
              Retention data requires play events with duration. Not enough data yet.
            </p>
          ) : (
            <RetentionCurveChart
              data={data.retentionCurve}
              songDuration={data.songDuration}
            />
          )}
        </div>

        {/* Link to song */}
        <div className="text-center">
          <Link
            href={`/songs/${data.songId}`}
            className="inline-flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 hover:underline"
          >
            <PlayIcon className="w-4 h-4" />
            Open song
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
