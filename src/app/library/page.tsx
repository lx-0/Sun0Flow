import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { LibraryView } from "@/components/LibraryView";
import { LibrarySkeleton } from "@/components/Skeleton";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Your Library",
  description: "Browse and manage all your AI-generated songs in one place.",
  robots: { index: false },
};
import { prisma } from "@/lib/prisma";

async function fetchSongs() {
  try {
    const session = await auth();
    if (!session?.user?.id) return [];
    const songs = await prisma.song.findMany({
      where: { userId: session.user.id, archivedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        favorites: { where: { userId: session.user.id }, select: { id: true } },
        _count: { select: { favorites: true } },
      },
    });
    return songs.map((s) => {
      const { favorites, _count, ...rest } = s;
      return {
        ...rest,
        isFavorite: favorites.length > 0,
        favoriteCount: _count.favorites,
      };
    });
  } catch {
    return [];
  }
}

export default async function LibraryPage() {
  const songs = await fetchSongs();

  return (
    <AppShell>
      <Suspense fallback={<LibrarySkeleton />}>
        <LibraryView initialSongs={songs} />
      </Suspense>
    </AppShell>
  );
}
