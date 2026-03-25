import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SongDetailView } from "@/components/SongDetailView";
import { SongDetailSkeleton } from "@/components/Skeleton";
import { sunoApi } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function fetchSong(id: string) {
  // Look up the song from the local database first (library links use Prisma IDs)
  try {
    const session = await auth();
    if (session?.user?.id) {
      const dbSong = await prisma.song.findFirst({
        where: { id, userId: session.user.id },
      });
      if (dbSong) {
        return {
          id: dbSong.id,
          title: dbSong.title ?? "Untitled",
          prompt: dbSong.prompt ?? "",
          tags: dbSong.tags ?? undefined,
          audioUrl: dbSong.audioUrl ?? "",
          imageUrl: dbSong.imageUrl ?? undefined,
          duration: dbSong.duration ?? undefined,
          status: (dbSong.generationStatus === "ready" ? "complete" : dbSong.generationStatus === "failed" ? "error" : "pending") as "complete" | "error" | "pending",
          model: dbSong.sunoModel ?? undefined,
          lyrics: dbSong.lyrics ?? undefined,
          createdAt: dbSong.createdAt.toISOString(),
        } satisfies import("@/lib/sunoapi").SunoSong;
      }
    }
  } catch {
    // DB lookup failed, continue to external API
  }

  // Fall back to external Suno API (e.g. for Suno-native IDs)
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
    if (!session?.user?.id) return { isFavorite: false, favoriteCount: 0, sunoJobId: null, isPublic: false, publicSlug: null, isHidden: false, isInstrumental: false };
    const dbSong = await prisma.song.findFirst({
      where: { id: songId, userId: session.user.id },
      select: {
        sunoJobId: true,
        isPublic: true,
        isHidden: true,
        isInstrumental: true,
        publicSlug: true,
        rating: true,
        ratingNote: true,
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
      isHidden: dbSong?.isHidden ?? false,
      isInstrumental: dbSong?.isInstrumental ?? false,
      rating: dbSong?.rating ?? null,
      ratingNote: dbSong?.ratingNote ?? null,
    };
  } catch {
    return { isFavorite: false, favoriteCount: 0, sunoJobId: null, isPublic: false, publicSlug: null, isHidden: false, isInstrumental: false, rating: null, ratingNote: null };
  }
}

async function fetchVariations(songId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) return { variations: [], variationCount: 0, maxVariations: 5, parentSongId: null, parentSongTitle: null };
    const dbSong = await prisma.song.findFirst({
      where: { id: songId, userId: session.user.id },
      select: { parentSongId: true },
    });

    // Find the root song ID
    const rootId = dbSong?.parentSongId ?? songId;

    const [variations, parentSong] = await Promise.all([
      prisma.song.findMany({
        where: { parentSongId: rootId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          prompt: true,
          tags: true,
          audioUrl: true,
          imageUrl: true,
          duration: true,
          lyrics: true,
          generationStatus: true,
          isInstrumental: true,
          createdAt: true,
        },
      }),
      dbSong?.parentSongId
        ? prisma.song.findUnique({
            where: { id: dbSong.parentSongId },
            select: { title: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      variations,
      variationCount: variations.length,
      maxVariations: 5,
      parentSongId: dbSong?.parentSongId ?? null,
      parentSongTitle: parentSong?.title ?? null,
    };
  } catch {
    return { variations: [], variationCount: 0, maxVariations: 5, parentSongId: null, parentSongTitle: null };
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

async function SongDetailContent({ id }: { id: string }) {
  const [song, dbMeta, playlists, songTags, variationData] = await Promise.all([
    fetchSong(id),
    fetchDbMeta(id),
    fetchPlaylists(),
    fetchSongTags(id),
    fetchVariations(id),
  ]);

  if (!song) notFound();

  return (
    <SongDetailView
      song={song}
      isFavorite={dbMeta.isFavorite}
      favoriteCount={dbMeta.favoriteCount}
      sunoJobId={dbMeta.sunoJobId}
      playlists={playlists}
      isPublic={dbMeta.isPublic}
      publicSlug={dbMeta.publicSlug}
      isHidden={dbMeta.isHidden}
      isInstrumental={dbMeta.isInstrumental}
      initialRating={dbMeta.rating}
      initialRatingNote={dbMeta.ratingNote}
      songTags={songTags}
      variations={variationData.variations}
      variationCount={variationData.variationCount}
      maxVariations={variationData.maxVariations}
      parentSongId={variationData.parentSongId}
      parentSongTitle={variationData.parentSongTitle}
    />
  );
}

export default function SongDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AppShell>
      <Suspense fallback={<SongDetailSkeleton />}>
        <SongDetailContent id={params.id} />
      </Suspense>
    </AppShell>
  );
}
