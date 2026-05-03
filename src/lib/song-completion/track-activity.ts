import { recordActivity } from "@/lib/activity";
import { recordDailyActivity, checkSongMilestones, checkStreakMilestones } from "@/lib/streaks";

export function trackCompletionActivity(userId: string, songId: string): void {
  recordActivity({ userId, type: "song_created", songId });

  recordDailyActivity(userId)
    .then((newStreak) => checkStreakMilestones(userId, newStreak))
    .catch(() => {});
  checkSongMilestones(userId).catch(() => {});
}
