import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { LibraryView } from "@/components/LibraryView";
import { LibrarySkeleton } from "@/components/Skeleton";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Favorites",
  description: "Your favorited AI-generated songs, all in one place.",
  robots: { index: false },
};
import { prisma } from "@/lib/prisma";

async function fetchFavorites() {
  try {
    const session = await auth();
    if (!session?.user?.id) return [];

    const favorites = await prisma.favorite.findMany({
      where: { userId: session.user.id },
      include: {
        song: {
          include: {
            songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
            _count: { select: { favorites: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return favorites.map((f) => ({
      ...f.song,
      isFavorite: true,
      favoriteCount: f.song._count.favorites,
    }));
  } catch {
    return [];
  }
}

export default async function FavoritesPage() {
  const songs = await fetchFavorites();

  return (
    <AppShell>
      <Suspense fallback={<LibrarySkeleton />}>
        {songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No favorites yet</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
              Tap the heart icon on any song to add it to your favorites collection.
            </p>
          </div>
        ) : (
          <LibraryView initialSongs={songs as never[]} title="Favorites" enableServerSearch={false} />
        )}
      </Suspense>
    </AppShell>
  );
}
