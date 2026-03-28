/**
 * Streaks and milestones engagement system.
 *
 * Streak logic:
 *  - A day is "active" when a user generates or plays a song.
 *  - Streak increments when the active day is the day after lastActiveDate.
 *  - Streak is unchanged when the active day equals lastActiveDate.
 *  - Streak resets to 1 when the active day is ≥2 days after lastActiveDate.
 *  - All dates are in UTC (YYYY-MM-DD).
 *
 * Milestone types:
 *  - first_song        First song generated (generationStatus → ready)
 *  - songs_10          10 songs generated
 *  - songs_100         100 songs generated
 *  - first_follower    First follower received
 *  - streak_5          5-day streak achieved
 */

import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/event-bus";

// ─── Constants ────────────────────────────────────────────────────────────────

export const MILESTONE_TYPES = [
  "first_song",
  "songs_10",
  "songs_100",
  "first_follower",
  "streak_5",
] as const;

export type MilestoneType = (typeof MILESTONE_TYPES)[number];

export const MILESTONE_META: Record<
  MilestoneType,
  { label: string; description: string; emoji: string }
> = {
  first_song: {
    label: "First Song",
    description: "Generated your first song",
    emoji: "🎵",
  },
  songs_10: {
    label: "10 Songs",
    description: "Generated 10 songs",
    emoji: "🎶",
  },
  songs_100: {
    label: "100 Songs",
    description: "Generated 100 songs",
    emoji: "🎸",
  },
  first_follower: {
    label: "First Follower",
    description: "Got your first follower",
    emoji: "🌟",
  },
  streak_5: {
    label: "5-Day Streak",
    description: "Active 5 days in a row",
    emoji: "🔥",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today's date in UTC as "YYYY-MM-DD". */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Difference in calendar days (UTC) between two "YYYY-MM-DD" strings.
 * Returns positive when b is after a.
 */
function dayDiff(a: string, b: string): number {
  const msA = new Date(`${a}T00:00:00Z`).getTime();
  const msB = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((msB - msA) / 86_400_000);
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Record a daily-active event for a user and update their streak.
 * Safe to call multiple times per day — idempotent for the same day.
 * Returns the new currentStreak value.
 */
export async function recordDailyActivity(userId: string): Promise<number> {
  const today = todayUTC();

  // Upsert streak row
  const existing = await prisma.userStreak.findUnique({ where: { userId } });

  if (!existing) {
    await prisma.userStreak.create({
      data: { userId, currentStreak: 1, longestStreak: 1, lastActiveDate: today },
    });
    return 1;
  }

  // Already recorded today — nothing to update
  if (existing.lastActiveDate === today) {
    return existing.currentStreak;
  }

  const diff = existing.lastActiveDate ? dayDiff(existing.lastActiveDate, today) : null;

  let newStreak: number;
  if (diff === 1) {
    // Consecutive day — increment
    newStreak = existing.currentStreak + 1;
  } else {
    // Gap or first time — reset to 1
    newStreak = 1;
  }

  const newLongest = Math.max(newStreak, existing.longestStreak);

  await prisma.userStreak.update({
    where: { userId },
    data: { currentStreak: newStreak, longestStreak: newLongest, lastActiveDate: today },
  });

  return newStreak;
}

/**
 * Award a milestone to a user if not already earned.
 * Broadcasts a "notification" SSE event and creates a Notification row.
 * Silently no-ops if already awarded.
 */
async function awardMilestone(userId: string, type: MilestoneType): Promise<void> {
  const meta = MILESTONE_META[type];

  // Skip if already earned
  const existing = await prisma.userMilestone.findUnique({
    where: { userId_type: { userId, type } },
  });
  if (existing) return;

  await prisma.userMilestone.create({ data: { userId, type } });

  // Create an in-app notification
  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: "milestone_earned",
        title: `${meta.emoji} ${meta.label} unlocked!`,
        message: meta.description,
        href: "/profile",
      },
    });

    broadcast(userId, {
      type: "notification",
      data: {
        id: notification.id,
        type: "milestone_earned",
        title: notification.title,
        message: notification.message,
        href: notification.href,
      },
    });
  } catch {
    // Non-critical — milestone row is already written
  }
}

/**
 * Check and award song-count milestones for a user.
 * Call after a new song reaches "ready" status.
 */
export async function checkSongMilestones(userId: string): Promise<void> {
  const count = await prisma.song.count({
    where: { userId, generationStatus: "ready" },
  });

  if (count >= 1) await awardMilestone(userId, "first_song");
  if (count >= 10) await awardMilestone(userId, "songs_10");
  if (count >= 100) await awardMilestone(userId, "songs_100");
}

/**
 * Check and award the first-follower milestone for a user.
 * Call after a new follow is created targeting `userId`.
 */
export async function checkFirstFollowerMilestone(userId: string): Promise<void> {
  await awardMilestone(userId, "first_follower");
}

/**
 * Check and award the streak_5 milestone.
 * Call after updating the streak.
 */
export async function checkStreakMilestones(
  userId: string,
  currentStreak: number
): Promise<void> {
  if (currentStreak >= 5) await awardMilestone(userId, "streak_5");
}
