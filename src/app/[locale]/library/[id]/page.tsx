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
          videoUrl: dbSong.videoUrl ?? undefined,
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
    if (!session?.user?.id) return { isFavorite: false, favoriteCount: 0, sunoJobId: null, isPublic: false, publicSlug: null, isHidden: false, isInstrumental: false, lyricsEdited: null };
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
        lyricsEdited: true,
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
      lyricsEdited: dbSong?.lyricsEdited ?? null,
      rating: dbSong?.rating ?? null,
      ratingNote: dbSong?.ratingNote ?? null,
    };
  } catch {
    return { isFavorite: false, favoriteCount: 0, sunoJobId: null, isPublic: false, publicSlug: null, isHidden: false, isInstrumental: false, lyricsEdited: null, rating: null, ratingNote: null };
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

async function SongDetailContent({ id }: { id: string }) {
  const [song, dbMeta, songTags, variationData] = await Promise.all([
    fetchSong(id),
    fetchDbMeta(id),
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
      isPublic={dbMeta.isPublic}
      publicSlug={dbMeta.publicSlug}
      isHidden={dbMeta.isHidden}
      isInstrumental={dbMeta.isInstrumental}
      initialRating={dbMeta.rating}
      initialRatingNote={dbMeta.ratingNote}
      lyricsEdited={dbMeta.lyricsEdited}
      songTags={songTags}
      variations={variationData.variations}
      variationCount={variationData.variationCount}
      maxVariations={variationData.maxVariations}
      parentSongId={variationData.parentSongId}
      parentSongTitle={variationData.parentSongTitle}
    />
  );
}

export default async function SongDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <Suspense fallback={<SongDetailSkeleton />}>
        <SongDetailContent id={id} />
      </Suspense>
    </AppShell>
  );
}
