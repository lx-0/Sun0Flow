import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { LibraryView } from "@/components/LibraryView";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Song } from "@prisma/client";

async function fetchFavorites(): Promise<Song[]> {
  try {
    const session = await auth();
    if (!session?.user?.id) return [];
    return await prisma.song.findMany({
      where: { userId: session.user.id, isFavorite: true },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return [];
  }
}

export default async function FavoritesPage() {
  const songs = await fetchFavorites();

  return (
    <AppShell>
      <Suspense>
        <LibraryView initialSongs={songs} title="Favorites" enableServerSearch={false} />
      </Suspense>
    </AppShell>
  );
}
