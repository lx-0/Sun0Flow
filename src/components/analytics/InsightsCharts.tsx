"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const TOOLTIP_STYLE = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#fff",
};

export function WeeklyFeedbackChart({
  data,
}: {
  data: Array<{ week: string; likes: number; dislikes: number }>;
}) {
  if (data.every((d) => d.likes === 0 && d.dislikes === 0)) {
    return <p className="text-gray-500 dark:text-gray-400 text-sm">No feedback data yet</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <XAxis
          dataKey="week"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickFormatter={(v: string) => v.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} width={28} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="likes" name="Likes" fill="#22c55e" radius={[3, 3, 0, 0]} />
        <Bar dataKey="dislikes" name="Dislikes" fill="#ef4444" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TagQualityChart({
  data,
}: {
  data: Array<{ tag: string; likes: number; dislikes: number; total: number; likeRatio: number }>;
}) {
  if (data.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400 text-sm">No tag data yet</p>;
  }
  // Show top 10 by total, display as horizontal bars
  const top = data.slice(0, 10);
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, top.length * 32)}>
      <BarChart data={top} layout="vertical">
        <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="tag"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          width={90}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="likes" name="Likes" fill="#22c55e" radius={[0, 3, 3, 0]} stackId="a" />
        <Bar dataKey="dislikes" name="Dislikes" fill="#ef4444" radius={[0, 3, 3, 0]} stackId="a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
