import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PlaylistDetailView } from "@/components/PlaylistDetailView";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function fetchPlaylist(id: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    return await prisma.playlist.findFirst({
      where: { id, userId: session.user.id },
      include: {
        songs: {
          orderBy: { position: "asc" },
          include: { song: true },
        },
        _count: { select: { songs: true } },
      },
    });
  } catch {
    return null;
  }
}

export default async function PlaylistDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const playlist = await fetchPlaylist(params.id);

  if (!playlist) {
    notFound();
  }

  return (
    <AppShell>
      <PlaylistDetailView
        playlist={JSON.parse(JSON.stringify(playlist))}
      />
    </AppShell>
  );
}
