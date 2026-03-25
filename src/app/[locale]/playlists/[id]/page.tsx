import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PlaylistDetailView } from "@/components/PlaylistDetailView";
import { PlaylistDetailSkeleton } from "@/components/Skeleton";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function fetchPlaylist(id: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    return await prisma.playlist.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        slug: true,
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

async function PlaylistDetailContent({ id }: { id: string }) {
  const playlist = await fetchPlaylist(id);
  if (!playlist) notFound();
  return <PlaylistDetailView playlist={JSON.parse(JSON.stringify(playlist))} />;
}

export default function PlaylistDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AppShell>
      <Suspense fallback={<PlaylistDetailSkeleton />}>
        <PlaylistDetailContent id={params.id} />
      </Suspense>
    </AppShell>
  );
}
