import { prisma } from "@/lib/prisma";
import { type Result, success, Err } from "@/lib/result";

type PublicProfile = {
  id: string;
  name: string | null;
  username: string;
  image: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  createdAt: Date;
  followersCount: number;
  followingCount: number;
  publicSongsCount: number;
  totalPlays: number;
  featuredSong: {
    id: string;
    title: string;
    imageUrl: string | null;
    audioUrl: string;
    duration: number | null;
    tags: string[];
    publicSlug: string | null;
  } | null;
  isFollowing: boolean;
};

export async function resolveUserIdByUsername(
  username: string,
): Promise<Result<{ id: string }>> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (!user) return Err.notFound("User not found");
  return success(user);
}

export async function getPublicUserProfileByUsername(
  username: string,
  viewerId?: string | null,
): Promise<Result<PublicProfile>> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      avatarUrl: true,
      bannerUrl: true,
      bio: true,
      featuredSongId: true,
      createdAt: true,
      _count: {
        select: {
          followers: true,
          following: true,
          songs: { where: { isPublic: true, isHidden: false, archivedAt: null, generationStatus: "ready" } },
        },
      },
    },
  });

  if (!user) return Err.notFound("User not found");

  const [follow, featuredSong, playStats] = await Promise.all([
    viewerId && viewerId !== user.id
      ? prisma.follow.findUnique({
          where: {
            followerId_followingId: { followerId: viewerId, followingId: user.id },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    user.featuredSongId
      ? prisma.song.findFirst({
          where: {
            id: user.featuredSongId,
            userId: user.id,
            isPublic: true,
            isHidden: false,
            archivedAt: null,
          },
          select: {
            id: true,
            title: true,
            imageUrl: true,
            audioUrl: true,
            duration: true,
            tags: true,
            publicSlug: true,
          },
        })
      : Promise.resolve(null),
    prisma.song.aggregate({
      where: {
        userId: user.id,
        isPublic: true,
        isHidden: false,
        archivedAt: null,
      },
      _sum: { playCount: true },
    }),
  ]);

  return success({
    id: user.id,
    name: user.name,
    username: user.username,
    image: user.image,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    bio: user.bio,
    createdAt: user.createdAt,
    followersCount: user._count.followers,
    followingCount: user._count.following,
    publicSongsCount: user._count.songs,
    totalPlays: playStats._sum.playCount ?? 0,
    featuredSong,
    isFollowing: !!follow,
  });
}
