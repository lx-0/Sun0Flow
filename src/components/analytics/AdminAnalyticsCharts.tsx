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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const PIE_COLORS = [
  "#7c3aed", "#a78bfa", "#c4b5fd", "#8b5cf6", "#6d28d9",
  "#5b21b6", "#4c1d95", "#ddd6fe", "#ede9fe", "#f5f3ff",
];

const TOOLTIP_STYLE = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#fff",
};

export function AdminGenerationsBarChart({
  data,
}: {
  data: Array<{ date: string; count: number }>;
}) {
  if (data.length === 0) {
    return <p className="text-gray-500 text-sm">No data for this period</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickFormatter={(v: string) => v.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          allowDecimals={false}
          width={40}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DailyActiveUsersChart({
  data,
}: {
  data: Array<{ date: string; count: number }>;
}) {
  if (data.length === 0) {
    return <p className="text-gray-500 text-sm">No data for this period</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickFormatter={(v: string) => v.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          allowDecimals={false}
          width={30}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#7c3aed"
          strokeWidth={2}
          dot={{ fill: "#7c3aed", r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function QualityTrendChart({
  data,
}: {
  data: Array<{ week: string; likes: number; dislikes: number; score: number }>;
}) {
  if (data.length === 0) {
    return <p className="text-gray-500 text-sm">No data for this period</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <XAxis
          dataKey="week"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickFormatter={(v: string) => v.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          width={42}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => [`${value}%`, "Quality Score"]}
          labelFormatter={(label) => `Week of ${label}`}
        />
        <Legend
          wrapperStyle={{ fontSize: "11px", color: "#9ca3af" }}
        />
        <Line
          type="monotone"
          dataKey="score"
          name="Quality Score (%)"
          stroke="#7c3aed"
          strokeWidth={2}
          dot={{ fill: "#7c3aed", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AdminGenrePieChart({
  data,
}: {
  data: Array<{ genre: string; count: number }>;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="genre"
            cx="50%"
            cy="50%"
            outerRadius={80}
            innerRadius={40}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2 justify-center">
        {data.map((g, i) => (
          <span
            key={g.genre}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${PIE_COLORS[i % PIE_COLORS.length]}20`,
              color: PIE_COLORS[i % PIE_COLORS.length],
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            {g.genre} ({g.count})
          </span>
        ))}
      </div>
    </div>
  );
}
