import { recordActivity } from "@/lib/activity";
import { notifyFollowersOfNewSong } from "@/lib/notifications";
import { recordDailyActivity, checkSongMilestones, checkStreakMilestones } from "@/lib/streaks";

export function trackCompletionActivity(userId: string, songId: string): void {
  recordActivity({ userId, type: "song_created", songId });
  notifyFollowersOfNewSong(userId, songId).catch(() => {});

  recordDailyActivity(userId)
    .then((newStreak) => checkStreakMilestones(userId, newStreak))
    .catch(() => {});
  checkSongMilestones(userId).catch(() => {});
}
