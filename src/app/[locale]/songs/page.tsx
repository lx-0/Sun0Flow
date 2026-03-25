import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { SongsGalleryView } from "@/components/SongsGalleryView";
import { SongsGallerySkeleton } from "@/components/Skeleton";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Songs Gallery",
  description: "View and manage your AI-generated songs in a visual gallery.",
  robots: { index: false },
};
import { prisma } from "@/lib/prisma";

async function fetchSongs() {
  try {
    const session = await auth();
    if (!session?.user?.id) return [];
    const songs = await prisma.song.findMany({
      where: { userId: session.user.id, generationStatus: "ready" },
      orderBy: { createdAt: "desc" },
      include: {
        songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
        favorites: { where: { userId: session.user.id }, select: { id: true } },
        _count: { select: { favorites: true, variations: true } },
      },
    });
    return songs.map((s) => {
      const { favorites, _count, ...rest } = s;
      return {
        ...rest,
        isFavorite: favorites.length > 0,
        favoriteCount: _count.favorites,
        variationCount: _count.variations,
      };
    });
  } catch {
    return [];
  }
}

export default async function SongsPage() {
  const songs = await fetchSongs();

  return (
    <AppShell>
      <Suspense fallback={<SongsGallerySkeleton />}>
        <SongsGalleryView initialSongs={songs} />
      </Suspense>
    </AppShell>
  );
}
