import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { PlaylistsView } from "@/components/PlaylistsView";
import { PlaylistsSkeleton } from "@/components/Skeleton";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Playlists",
  description: "Organize your AI-generated music into custom playlists.",
  robots: { index: false },
};
import { prisma } from "@/lib/prisma";
import { ensureDefaultSmartPlaylists } from "@/lib/smart-playlists";

async function fetchPlaylists() {
  try {
    const session = await auth();
    if (!session?.user?.id) return { playlists: [], smartPlaylists: [] };

    const userId = session.user.id;

    // Ensure smart playlists exist for this user (no-op after first visit)
    await ensureDefaultSmartPlaylists(userId);

    const [playlists, smartPlaylists] = await Promise.all([
      prisma.playlist.findMany({
        where: { userId, isSmartPlaylist: false },
        include: {
          _count: {
            select: { songs: { where: { song: { archivedAt: null } } } },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.playlist.findMany({
        where: { userId, isSmartPlaylist: true },
        include: {
          _count: {
            select: { songs: { where: { song: { archivedAt: null } } } },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return { playlists, smartPlaylists };
  } catch {
    return { playlists: [], smartPlaylists: [] };
  }
}

async function PlaylistsContent() {
  const { playlists, smartPlaylists } = await fetchPlaylists();
  return (
    <PlaylistsView
      playlists={JSON.parse(JSON.stringify(playlists))}
      smartPlaylists={JSON.parse(JSON.stringify(smartPlaylists))}
    />
  );
}

export default function PlaylistsPage() {
  return (
    <AppShell>
      <Suspense fallback={<PlaylistsSkeleton />}>
        <PlaylistsContent />
      </Suspense>
    </AppShell>
  );
}
