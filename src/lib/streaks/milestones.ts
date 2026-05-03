import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

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

async function awardMilestone(userId: string, type: MilestoneType): Promise<void> {
  const meta = MILESTONE_META[type];

  const existing = await prisma.userMilestone.findUnique({
    where: { userId_type: { userId, type } },
  });
  if (existing) return;

  await prisma.userMilestone.create({ data: { userId, type } });

  try {
    await createNotification({
      userId,
      type: "milestone_earned",
      title: `${meta.emoji} ${meta.label} unlocked!`,
      message: meta.description,
      href: "/profile",
    });
  } catch {
    // Non-critical — milestone row is already written
  }
}

export async function checkSongMilestones(userId: string): Promise<void> {
  const count = await prisma.song.count({
    where: { userId, generationStatus: "ready" },
  });

  if (count >= 1) await awardMilestone(userId, "first_song");
  if (count >= 10) await awardMilestone(userId, "songs_10");
  if (count >= 100) await awardMilestone(userId, "songs_100");
}

export async function checkFirstFollowerMilestone(userId: string): Promise<void> {
  await awardMilestone(userId, "first_follower");
}

export async function checkStreakMilestones(
  userId: string,
  currentStreak: number
): Promise<void> {
  if (currentStreak >= 5) await awardMilestone(userId, "streak_5");
}
