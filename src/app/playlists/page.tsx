import { AppShell } from "@/components/AppShell";
import { PlaylistsView } from "@/components/PlaylistsView";
import { auth } from "@/lib/auth";
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

export default async function PlaylistsPage() {
  const playlists = await fetchPlaylists();

  return (
    <AppShell>
      <PlaylistsView playlists={JSON.parse(JSON.stringify(playlists))} />
    </AppShell>
  );
}
