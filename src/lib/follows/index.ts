import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { checkFirstFollowerMilestone } from "@/lib/streaks";
import {
  DEFAULT_PAGE_SIZE,
  offsetPagination,
  pageSkip,
  type OffsetPagination,
} from "@/lib/pagination";
import { type Result, success, Err } from "@/lib/result";

// ---------------------------------------------------------------------------
// Follow / Unfollow
// ---------------------------------------------------------------------------

export async function followUser(
  followerId: string,
  followingId: string,
): Promise<Result<{ following: true }>> {
  if (followerId === followingId) {
    return Err.validation("You cannot follow yourself");
  }

  const target = await prisma.user.findUnique({
    where: { id: followingId },
    select: { id: true },
  });
  if (!target) return Err.notFound("User not found");

  const { created } = await prisma.$transaction(async (tx) => {
    const existing = await tx.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (!existing) {
      await tx.follow.create({ data: { followerId, followingId } });
      return { created: true };
    }
    return { created: false };
  });

  if (created) {
    notifyNewFollower(followerId, followingId).catch(() => {});
    checkFirstFollowerMilestone(followingId).catch(() => {});
  }

  return success({ following: true });
}

export async function unfollowUser(
  followerId: string,
  followingId: string,
): Promise<Result<{ following: false }>> {
  await prisma.follow.deleteMany({
    where: { followerId, followingId },
  });
  return success({ following: false });
}

// ---------------------------------------------------------------------------
// Query: is the viewer following a target?
// ---------------------------------------------------------------------------

export async function isFollowing(
  followerId: string,
  followingId: string,
): Promise<boolean> {
  if (followerId === followingId) return false;
  const follow = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
    select: { id: true },
  });
  return !!follow;
}

// ---------------------------------------------------------------------------
// Query: list users the caller follows
// ---------------------------------------------------------------------------

export interface FollowingUser {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followersCount: number;
  publicSongsCount: number;
  followedAt: Date;
}

export interface FollowingList {
  users: FollowingUser[];
  pagination: OffsetPagination;
}

export async function listFollowing(
  userId: string,
  page: number,
): Promise<Result<FollowingList>> {
  const safePage = Math.max(1, page);
  const skip = pageSkip(safePage, DEFAULT_PAGE_SIZE);

  const [follows, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: DEFAULT_PAGE_SIZE,
      select: {
        createdAt: true,
        following: {
          select: {
            id: true,
            name: true,
            username: true,
            image: true,
            avatarUrl: true,
            bio: true,
            _count: {
              select: {
                followers: true,
                songs: {
                  where: { isPublic: true, isHidden: false, archivedAt: null },
                },
              },
            },
          },
        },
      },
    }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);

  const users: FollowingUser[] = follows.map(({ following, createdAt }) => ({
    id: following.id,
    name: following.name,
    username: following.username,
    image: following.image,
    avatarUrl: following.avatarUrl,
    bio: following.bio,
    followersCount: following._count.followers,
    publicSongsCount: following._count.songs,
    followedAt: createdAt,
  }));

  return success({
    users,
    pagination: offsetPagination(safePage, DEFAULT_PAGE_SIZE, total),
  });
}

// ---------------------------------------------------------------------------
// Internal: fire-and-forget notification for new follow
// ---------------------------------------------------------------------------

async function notifyNewFollower(
  followerId: string,
  followingId: string,
): Promise<void> {
  const follower = await prisma.user.findUnique({
    where: { id: followerId },
    select: { name: true, username: true },
  });
  const followerName = follower?.name ?? follower?.username ?? "Someone";
  const profileHref = follower?.username ? `/u/${follower.username}` : null;

  await notifyUser({
    userId: followingId,
    type: "new_follower",
    title: "New follower",
    message: `${followerName} started following you`,
    href: profileHref,
    push: { tag: `new-follower-${followerId}` },
  });
}
