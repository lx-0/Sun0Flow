"use client";

import { useEffect, useState } from "react";
import {
  UsersIcon,
  MusicalNoteIcon,
  BoltIcon,
  UserGroupIcon,
  FlagIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface Stats {
  totalUsers: number;
  totalGenerations: number;
  generationsToday: number;
  activeUsers: number;
  pendingReports: number;
  recentErrors: number;
  dailyGenerations: Array<{ date: string; count: number }>;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        <Icon className="w-5 h-5 text-gray-500" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function MiniChart({ data }: { data: Array<{ date: string; count: number }> }) {
  if (data.length === 0) {
    return <p className="text-gray-500 text-sm">No data available</p>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((d) => (
        <div
          key={d.date}
          className="flex-1 group relative"
          title={`${d.date}: ${d.count}`}
        >
          <div
            className="bg-violet-500/80 hover:bg-violet-400 rounded-t transition-colors w-full"
            style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? "2px" : "0" }}
          />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-xs text-white px-2 py-1 rounded whitespace-nowrap z-10">
            {d.date}: {d.count}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-400" />
      </div>
    );
  }

  if (!stats) {
    return <p className="text-red-400">Failed to load stats</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Users" value={stats.totalUsers} icon={UsersIcon} />
        <StatCard label="Total Generations" value={stats.totalGenerations} icon={MusicalNoteIcon} />
        <StatCard label="Today" value={stats.generationsToday} icon={BoltIcon} />
        <StatCard label="Active (7d)" value={stats.activeUsers} icon={UserGroupIcon} />
        <StatCard label="Pending Reports" value={stats.pendingReports} icon={FlagIcon} />
        <StatCard label="Errors Today" value={stats.recentErrors} icon={ExclamationTriangleIcon} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Daily Generations (Last 30 Days)</h2>
        <MiniChart data={stats.dailyGenerations} />
      </div>
    </div>
  );
}
