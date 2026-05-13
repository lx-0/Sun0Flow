import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached, cacheKey, CacheTTL, CacheControl } from "@/lib/cache";
import { withTiming } from "@/lib/timing";
import { isFollowing } from "@/lib/follows";
import { optionalAuthRoute } from "@/lib/route-handler";
import { notFound } from "@/lib/api-error";

async function getPublicUserData(userId: string) {
  return cached(
    cacheKey("user-profile", userId),
    () =>
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          image: true,
          createdAt: true,
          _count: {
            select: {
              followers: true,
              following: true,
              songs: { where: { isPublic: true, isHidden: false, archivedAt: null } },
            },
          },
        },
      }),
    CacheTTL.USER_PROFILE
  );
}

const handleGET = optionalAuthRoute<{ id: string }>(async (_request, { auth, params }) => {
  const user = await getPublicUserData(params.id);
  if (!user) {
    return notFound("User not found");
  }

  const viewerFollowing = auth.userId
    ? await isFollowing(auth.userId, params.id)
    : false;

  return NextResponse.json(
    {
      id: user.id,
      name: user.name,
      image: user.image,
      createdAt: user.createdAt,
      followersCount: user._count.followers,
      followingCount: user._count.following,
      publicSongsCount: user._count.songs,
      isFollowing: viewerFollowing,
    },
    { headers: { "Cache-Control": CacheControl.privateShort } }
  );
}, { route: "/api/users/[id]" });

export const GET = withTiming("/api/users/[id]", handleGET);
