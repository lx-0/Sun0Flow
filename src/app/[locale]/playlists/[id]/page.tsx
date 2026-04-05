import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PlaylistDetailView } from "@/components/PlaylistDetailView";
import { PlaylistDetailSkeleton } from "@/components/Skeleton";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function fetchPlaylist(id: string, userId: string) {
  try {
    // Allow owner or accepted collaborator
    const playlist = await prisma.playlist.findFirst({
      where: {
        id,
        OR: [
          { userId },
          {
            isCollaborative: true,
            collaborators: { some: { userId, status: "accepted" } },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        isPublished: true,
        publishedAt: true,
        genre: true,
        isCollaborative: true,
        slug: true,
        userId: true,
        songs: {
          orderBy: { position: "asc" },
          include: {
            song: true,
            addedByUser: { select: { id: true, name: true, image: true, avatarUrl: true } },
          },
        },
        _count: { select: { songs: true } },
        collaborators: {
          where: { status: "accepted" },
          select: {
            id: true,
            userId: true,
            status: true,
            user: { select: { id: true, name: true, image: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!playlist) return null;
    const isOwner = playlist.userId === userId;
    return { playlist, isOwner };
  } catch {
    return null;
  }
}

async function PlaylistDetailContent({ id }: { id: string }) {
  const session = await auth();
  if (!session?.user?.id) notFound();
  const result = await fetchPlaylist(id, session.user.id);
  if (!result) notFound();
  const { playlist, isOwner } = result;
  return (
    <PlaylistDetailView
      playlist={JSON.parse(JSON.stringify(playlist))}
      isOwner={isOwner}
    />
  );
}

export default async function PlaylistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <Suspense fallback={<PlaylistDetailSkeleton />}>
        <PlaylistDetailContent id={id} />
      </Suspense>
    </AppShell>
  );
}
