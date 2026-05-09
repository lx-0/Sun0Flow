export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dayDiff(a: string, b: string): number {
  const msA = new Date(`${a}T00:00:00Z`).getTime();
  const msB = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((msB - msA) / 86_400_000);
}

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

export interface StreakUpdate {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
}

export function computeStreakUpdate(
  existing: StreakState | null,
  today: string
): StreakUpdate {
  if (!existing) {
    return { currentStreak: 1, longestStreak: 1, lastActiveDate: today };
  }

  if (existing.lastActiveDate === today) {
    return {
      currentStreak: existing.currentStreak,
      longestStreak: existing.longestStreak,
      lastActiveDate: today,
    };
  }

  const diff = existing.lastActiveDate ? dayDiff(existing.lastActiveDate, today) : null;
  const newStreak = diff === 1 ? existing.currentStreak + 1 : 1;
  const newLongest = Math.max(newStreak, existing.longestStreak);

  return { currentStreak: newStreak, longestStreak: newLongest, lastActiveDate: today };
}
