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

async function fetchPlaylists() {
  try {
    const session = await auth();
    if (!session?.user?.id) return [];
    return await prisma.playlist.findMany({
      where: { userId: session.user.id },
      include: { _count: { select: { songs: true } } },
      orderBy: { updatedAt: "desc" },
    });
  } catch {
    return [];
  }
}

async function PlaylistsContent() {
  const playlists = await fetchPlaylists();
  return <PlaylistsView playlists={JSON.parse(JSON.stringify(playlists))} />;
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
