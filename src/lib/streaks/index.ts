import { prisma } from "@/lib/prisma";
import { todayUTC, computeStreakUpdate } from "./calculate";

export { MILESTONE_TYPES, MILESTONE_META, checkSongMilestones, checkFirstFollowerMilestone, checkStreakMilestones } from "./milestones";
export type { MilestoneType } from "./milestones";
export { todayUTC, dayDiff, computeStreakUpdate } from "./calculate";
export type { StreakState, StreakUpdate } from "./calculate";

export async function recordDailyActivity(userId: string): Promise<number> {
  const today = todayUTC();
  const existing = await prisma.userStreak.findUnique({ where: { userId } });

  const update = computeStreakUpdate(
    existing ? { currentStreak: existing.currentStreak, longestStreak: existing.longestStreak, lastActiveDate: existing.lastActiveDate } : null,
    today
  );

  if (!existing) {
    await prisma.userStreak.create({
      data: { userId, ...update },
    });
    return update.currentStreak;
  }

  if (existing.lastActiveDate === today) {
    return existing.currentStreak;
  }

  await prisma.userStreak.update({
    where: { userId },
    data: update,
  });

  return update.currentStreak;
}
