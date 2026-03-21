import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SongDetailView } from "@/components/SongDetailView";
import { sunoApi } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function fetchSong(id: string) {
  try {
    return await sunoApi.getSongById(id);
  } catch {
    // Fall back to mock data when SUNOAPI_KEY is not configured
    return mockSongs.find((s) => s.id === id) ?? null;
  }
}

async function fetchDbMeta(songId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { isFavorite: false, favoriteCount: 0, sunoJobId: null, isPublic: false, publicSlug: null };
    const dbSong = await prisma.song.findFirst({
      where: { id: songId, userId: session.user.id },
      select: {
        sunoJobId: true,
        isPublic: true,
        publicSlug: true,
        _count: { select: { favorites: true } },
        favorites: { where: { userId: session.user.id }, select: { id: true } },
      },
    });
    return {
      isFavorite: (dbSong?.favorites?.length ?? 0) > 0,
      favoriteCount: dbSong?._count?.favorites ?? 0,
      sunoJobId: dbSong?.sunoJobId ?? null,
      isPublic: dbSong?.isPublic ?? false,
      publicSlug: dbSong?.publicSlug ?? null,
    };
  } catch {
    return { isFavorite: false, favoriteCount: 0, sunoJobId: null, isPublic: false, publicSlug: null };
  }
}

async function fetchSongTags(songId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return [];
    const songTags = await prisma.songTag.findMany({
      where: { songId, song: { userId: session.user.id } },
      include: { tag: true },
      orderBy: { tag: { name: "asc" } },
    });
    return songTags.map((st) => ({ id: st.tag.id, name: st.tag.name, color: st.tag.color }));
  } catch {
    return [];
  }
}

async function fetchPlaylists() {
  try {
    const session = await auth();
    if (!session?.user?.id) return [];
    const playlists = await prisma.playlist.findMany({
      where: { userId: session.user.id },
      include: { _count: { select: { songs: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return playlists.map((p) => ({ id: p.id, name: p.name, _count: p._count }));
  } catch {
    return [];
  }
}

export default async function SongDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [song, dbMeta, playlists, songTags] = await Promise.all([
    fetchSong(params.id),
    fetchDbMeta(params.id),
    fetchPlaylists(),
    fetchSongTags(params.id),
  ]);

  if (!song) {
    notFound();
  }

  return (
    <AppShell>
      <SongDetailView
        song={song}
        isFavorite={dbMeta.isFavorite}
        favoriteCount={dbMeta.favoriteCount}
        sunoJobId={dbMeta.sunoJobId}
        playlists={playlists}
        isPublic={dbMeta.isPublic}
        publicSlug={dbMeta.publicSlug}
        songTags={songTags}
      />
    </AppShell>
  );
}
