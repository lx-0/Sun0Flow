type CreditRow = { date: string; credits: bigint; count: bigint };

export type DailyCredit = { date: string; credits: number; count: number };

export function buildCreditChart(
  creditStats: CreditRow[],
  now: Date
): DailyCredit[] {
  const creditMap: Record<string, { credits: number; count: number }> = {};
  for (const row of creditStats) {
    const dateStr = new Date(row.date).toISOString().slice(0, 10);
    creditMap[dateStr] = { credits: Number(row.credits), count: Number(row.count) };
  }

  const creditUsageByDay: DailyCredit[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = creditMap[dateStr] ?? { credits: 0, count: 0 };
    creditUsageByDay.push({ date: dateStr, ...entry });
  }

  return creditUsageByDay;
}
