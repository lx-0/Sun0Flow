export interface WeeklyDataPoint {
  week: string;
  likes: number;
  dislikes: number;
}

export interface WeeklyRawRow {
  week: Date;
  likes: bigint;
  dislikes: bigint;
}

export function buildWeeklyTrend(
  rawRows: WeeklyRawRow[],
  now: Date = new Date(),
  weeks = 12,
): WeeklyDataPoint[] {
  const result: WeeklyDataPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const dayOfWeek = d.getDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    d.setDate(d.getDate() + diffToMon);
    d.setHours(0, 0, 0, 0);
    const weekStr = d.toISOString().slice(0, 10);

    const match = rawRows.find(
      (r) => new Date(r.week).toISOString().slice(0, 10) === weekStr,
    );

    result.push({
      week: weekStr,
      likes: match ? Number(match.likes) : 0,
      dislikes: match ? Number(match.dislikes) : 0,
    });
  }

  return result;
}
