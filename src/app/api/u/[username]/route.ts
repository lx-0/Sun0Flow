import { NextResponse } from "next/server";
import { optionalAuthRoute } from "@/lib/route-handler";
import { notFound } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

type FeaturedSongPayload = {
  id: string;
  title: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  tags: string | null;
  publicSlug: string | null;
};

function normalizeFeaturedSong(song: FeaturedSongPayload) {
  return {
    id: song.id,
    title: song.title ?? "Untitled",
    imageUrl: song.imageUrl,
    audioUrl: song.audioUrl,
    duration: song.duration,
    tags: song.tags,
    publicSlug: song.publicSlug,
  };
}


export const GET = optionalAuthRoute<{ username: string }>(async (_request, { auth, params }) => {
  const viewerId = auth.userId;

  const user = await prisma.user.findUnique({
    where: { username: params.username },
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

  if (!user) {
    return notFound("User not found");
  }

  let isFollowing = false;
  if (viewerId && viewerId !== user.id) {
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: viewerId, followingId: user.id },
      },
      select: { id: true },
    });
    isFollowing = !!follow;
  }

  // Fetch featured song if set
  let featuredSong = null;
  if (user.featuredSongId) {
    featuredSong = await prisma.song.findFirst({
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
    });
  }

  // Compute total play count across public songs
  const playStats = await prisma.song.aggregate({
    where: {
      userId: user.id,
      isPublic: true,
      isHidden: false,
      archivedAt: null,
    },
    _sum: { playCount: true },
  });

  return NextResponse.json({
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
    featuredSong: featuredSong ? normalizeFeaturedSong(featuredSong) : null,
    isFollowing,
  });
}, { route: "/api/u/[username]" });
