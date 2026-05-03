export type StreakResult = {
  currentStreak: number;
  longestStreak: number;
};

export function calculateActivityStreaks(
  activeDayRows: Array<{ day: string }>,
  now: Date
): StreakResult {
  const activeDays = activeDayRows.map((r) =>
    new Date(r.day).toISOString().slice(0, 10)
  );
  const activeDaysSet = new Set(activeDays);

  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  let currentStreak = 0;
  if (activeDaysSet.has(todayStr) || activeDaysSet.has(yesterdayStr)) {
    const startDay = activeDaysSet.has(todayStr) ? todayStr : yesterdayStr;
    let checkDate = new Date(startDay);
    while (true) {
      const checkStr = checkDate.toISOString().slice(0, 10);
      if (!activeDaysSet.has(checkStr)) break;
      currentStreak++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    }
  }

  let longestStreak = 0;
  let runningStreak = 0;
  for (let i = 0; i < 90; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    if (activeDaysSet.has(dStr)) {
      runningStreak++;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  return { currentStreak, longestStreak };
}
