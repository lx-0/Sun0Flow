export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function startOfWeek(): Date {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - now.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function dateRangeStart(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseDateRange(range: string): Date {
  const now = new Date();
  switch (range) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "all":
      return new Date(0);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export function fillDailySeries(
  raw: Array<{ date: string; count: bigint }>,
  days: number,
): Array<{ date: string; count: number }> {
  const now = new Date();
  const map = new Map(
    raw.map((r) => [r.date.toString().slice(0, 10), Number(r.count)]),
  );
  const result: Array<{ date: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map.get(key) ?? 0 });
  }
  return result;
}

export function mondayOfWeeksAgo(weeksAgo: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - weeksAgo * 7);
  const dayOfWeek = d.getUTCDay();
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + diffToMon);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function fillWeeklySeries(
  raw: Array<{ week: Date; count: bigint }>,
  weeks: number,
): Array<{ week: string; count: number }> {
  const map = new Map(
    raw.map((r) => [new Date(r.week).toISOString().slice(0, 10), Number(r.count)]),
  );
  const result: Array<{ week: string; count: number }> = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStr = mondayOfWeeksAgo(i);
    result.push({ week: weekStr, count: map.get(weekStr) ?? 0 });
  }
  return result;
}
