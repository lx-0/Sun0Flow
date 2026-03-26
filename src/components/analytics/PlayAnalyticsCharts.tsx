"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";

const TOOLTIP_STYLE = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#fff",
};

export function DailyPlaysLineChart({
  data,
}: {
  data: Array<{ date: string; count: number }>;
}) {
  const formatted = data.map((d) => ({
    ...d,
    label: d.date.slice(5), // MM-DD
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={formatted}>
        <defs>
          <linearGradient id="playsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          allowDecimals={false}
          width={28}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => `Date: ${v}`} />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#7c3aed"
          strokeWidth={2}
          fill="url(#playsGradient)"
          name="Plays"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TopSongsBarChart({
  data,
}: {
  data: Array<{ title: string; plays: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical">
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="title"
          tick={{ fontSize: 11, fill: "#d1d5db" }}
          width={120}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="plays" fill="#7c3aed" radius={[0, 4, 4, 0]} name="Plays" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RetentionCurveChart({
  data,
  songDuration,
}: {
  data: Array<{ pct: number; count: number; rate: number }>;
  songDuration: number | null;
}) {
  const formatted = data.map((d) => ({
    ...d,
    label: songDuration
      ? `${Math.round((d.pct / 100) * songDuration)}s`
      : `${d.pct}%`,
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickFormatter={(v) => `${Math.round(v)}%`}
          width={36}
          tickLine={false}
          axisLine={false}
          domain={[0, 100]}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number) => [`${Math.round(v)}%`, "Retention"]}
        />
        <Line
          type="monotone"
          dataKey="rate"
          stroke="#a78bfa"
          strokeWidth={2}
          dot={false}
          name="Retention"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
