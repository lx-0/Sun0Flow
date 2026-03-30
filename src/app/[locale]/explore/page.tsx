import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { DiscoverView } from "../discover/DiscoverView";

export const metadata: Metadata = {
  title: "Explore Songs — SunoFlow",
  description:
    "Browse and listen to publicly shared AI-generated songs on SunoFlow.",
  openGraph: {
    title: "Explore Songs — SunoFlow",
    description:
      "Browse and listen to publicly shared AI-generated songs on SunoFlow.",
    type: "website",
  },
};

/** ISR: revalidate explore page every 60 seconds */
export const revalidate = 60;

async function getInitialBrowseSongs() {
  const where = {
    isPublic: true,
    isHidden: false,
    archivedAt: null as null,
    generationStatus: "ready",
  };
  const key = cacheKey("discover", "newest", "all", "any", "0", "999", "1");
  const { songs, total } = await cached(
    key,
    async () => {
      const [results, count] = await Promise.all([
        prisma.song.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            title: true,
            tags: true,
            imageUrl: true,
            audioUrl: true,
            duration: true,
            rating: true,
            playCount: true,
            publicSlug: true,
            createdAt: true,
            user: { select: { id: true, name: true, username: true } },
          },
        }),
        prisma.song.count({ where }),
      ]);
      return { songs: results, total: count };
    },
    CacheTTL.DISCOVER
  );
  const totalPages = Math.ceil(total / 20);
  return {
    songs: songs.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    pagination: { page: 1, totalPages, total, hasMore: totalPages > 1 },
  };
}

export default async function ExplorePage() {
  const { songs, pagination } = await getInitialBrowseSongs();
  return (
    <DiscoverView
      basePath="/explore"
      initialSongs={songs}
      initialPagination={pagination}
      defaultTab="browse"
    />
  );
}
