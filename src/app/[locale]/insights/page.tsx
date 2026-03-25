"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { AppShell } from "@/components/AppShell";
import {
  HandThumbUpIcon,
  HandThumbDownIcon,
  SparklesIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

const WeeklyFeedbackChart = dynamic(
  () =>
    import("@/components/analytics/InsightsCharts").then(
      (mod) => mod.WeeklyFeedbackChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
    ),
  }
);

const TagQualityChart = dynamic(
  () =>
    import("@/components/analytics/InsightsCharts").then(
      (mod) => mod.TagQualityChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
    ),
  }
);

interface InsightsData {
  totalLikes: number;
  totalDislikes: number;
  tagBreakdown: Array<{
    tag: string;
    likes: number;
    dislikes: number;
    total: number;
    likeRatio: number;
  }>;
  topCombos: Array<{
    combo: string;
    likes: number;
    dislikes: number;
    total: number;
    likeRatio: number;
  }>;
  weeklyTrend: Array<{ week: string; likes: number; dislikes: number }>;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/insights");
      if (res.ok) {
        setData(await res.json());
      } else {
        setError(true);
      }
    } catch {
      setError(true);
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
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Generation Quality Insights
          </h1>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-400" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="px-4 py-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Generation Quality Insights
          </h1>
          <p className="text-red-400">Failed to load insights. Please try again.</p>
        </div>
      </AppShell>
    );
  }

  const totalFeedback = data.totalLikes + data.totalDislikes;
  const likePercent =
    totalFeedback > 0 ? Math.round((data.totalLikes / totalFeedback) * 100) : null;

  const isEmpty = totalFeedback === 0;

  return (
    <AppShell>
      <div className="px-4 py-6 space-y-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Generation Quality Insights
        </h1>

        {isEmpty ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
            <ChartBarIcon className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No feedback yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Give songs a thumbs up or down to start seeing quality trends here.
            </p>
          </div>
        ) : (
          <>
            {/* Overall stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard
                label="Total Likes"
                value={data.totalLikes}
                icon={HandThumbUpIcon}
                color="text-green-500"
              />
              <StatCard
                label="Total Dislikes"
                value={data.totalDislikes}
                icon={HandThumbDownIcon}
                color="text-red-500"
              />
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Like Rate
                  </span>
                  <SparklesIcon className="w-4 h-4 text-violet-400" />
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {likePercent !== null ? `${likePercent}%` : "—"}
                </div>
              </div>
            </div>

            {/* Like rate bar */}
            {likePercent !== null && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    {data.totalLikes} liked · {data.totalDislikes} disliked
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {totalFeedback} total
                  </span>
                </div>
                <div className="w-full h-3 bg-red-100 dark:bg-red-900/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${likePercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Weekly trend */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
                Quality Trend (Last 12 Weeks)
              </h2>
              <WeeklyFeedbackChart data={data.weeklyTrend} />
            </div>

            {/* Tag breakdown */}
            {data.tagBreakdown.length > 0 && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
                  Quality by Style Tag
                </h2>
                <TagQualityChart data={data.tagBreakdown} />
              </div>
            )}

            {/* Top performing combos */}
            {data.topCombos.length > 0 && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">
                  Try These High-Performing Combos
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Based on your feedback history
                </p>
                <div className="space-y-3">
                  {data.topCombos.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40"
                    >
                      <span className="text-sm font-bold text-violet-400 w-5 text-right flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {c.combo}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {c.likes} liked · {c.dislikes} disliked
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-sm font-semibold text-green-600 dark:text-green-400">
                        {Math.round(c.likeRatio * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
