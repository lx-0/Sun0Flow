type PlayEntry = {
  playedAt: Date;
  song: { duration: number | null };
};

type DailyListening = { date: string; seconds: number; minutes: number };

export type ListeningTimeResult = {
  totalListeningTimeSec: number;
  dailyListeningTime: DailyListening[];
};

export function calculateListeningTime(
  playHistory: PlayEntry[],
  now: Date
): ListeningTimeResult {
  let totalListeningTimeSec = 0;
  const dailyMap: Record<string, number> = {};

  for (const entry of playHistory) {
    const dur = entry.song.duration ?? 0;
    totalListeningTimeSec += dur;
    const dateStr = entry.playedAt.toISOString().slice(0, 10);
    dailyMap[dateStr] = (dailyMap[dateStr] ?? 0) + dur;
  }

  const dailyListeningTime: DailyListening[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const sec = dailyMap[dateStr] ?? 0;
    dailyListeningTime.push({ date: dateStr, seconds: sec, minutes: Math.round(sec / 60) });
  }

  return { totalListeningTimeSec: Math.round(totalListeningTimeSec), dailyListeningTime };
}
