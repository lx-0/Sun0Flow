type HourCount = { hour: number; count: bigint };

export type PeakHour = { hour: number; count: number };

export function buildPeakHoursHeatmap(rawHourCounts: HourCount[]): PeakHour[] {
  return Array.from({ length: 24 }, (_, h) => {
    const match = rawHourCounts.find((r) => Number(r.hour) === h);
    return { hour: h, count: match ? Number(match.count) : 0 };
  });
}
