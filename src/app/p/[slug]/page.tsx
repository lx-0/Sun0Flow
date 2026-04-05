import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicPlaylistView } from "./PublicPlaylistView";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

/**
 * Safely serialize data for use in a <script type="application/ld+json"> tag.
 * JSON.stringify alone does not escape </script>, which allows an attacker to
 * break out of the script tag via a crafted title or description.
 * Replacing <, >, and & with their Unicode escapes is idiomatic JSON-LD practice.
 */
function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** ISR: revalidate public playlist pages every 60 seconds */
export const revalidate = 60;

const getPlaylist = cache((slug: string) =>
  cached(
    cacheKey("public-playlist", slug),
    () =>
      prisma.playlist.findUnique({
        where: { slug },
        include: {
          user: { select: { name: true } },
          songs: {
            orderBy: { position: "asc" },
            include: {
              song: {
                select: {
                  id: true,
                  title: true,
                  audioUrl: true,
                  imageUrl: true,
                  duration: true,
                  tags: true,
                  isHidden: true,
                  archivedAt: true,
                },
              },
            },
          },
        },
      }),
    CacheTTL.PUBLIC_SONG
  )
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const playlist = await getPlaylist(slug);

  if (!playlist || !playlist.isPublic) {
    return { robots: { index: false } };
  }

  const title = playlist.name;
  const creatorName = playlist.user.name ?? "Unknown";
  const visibleSongs = playlist.songs.filter(
    (ps) => !ps.song.isHidden && !ps.song.archivedAt
  );
  const description =
    playlist.description ??
    `${visibleSongs.length} song${visibleSongs.length !== 1 ? "s" : ""} by ${creatorName} on SunoFlow`;
  const canonicalUrl = `${siteUrl}/p/${slug}`;

  // Use first song's image as OG image
  const firstImage = visibleSongs.find((ps) => ps.song.imageUrl)?.song.imageUrl;

  return {
    title: `${title} by ${creatorName}`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${title} by ${creatorName}`,
      description,
      url: canonicalUrl,
      type: "music.playlist",
      siteName: "SunoFlow",
      images: firstImage
        ? [{ url: firstImage, alt: title }]
        : [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "SunoFlow" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} by ${creatorName}`,
      description,
      images: firstImage ? [firstImage] : ["/icons/icon-512.png"],
    },
  };
}

export default async function PublicPlaylistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const playlist = await getPlaylist(slug);

  if (!playlist || !playlist.isPublic) {
    notFound();
  }

  const creatorName = playlist.user.name ?? "Unknown Artist";

  // Filter out hidden/archived songs
  const visibleSongs = playlist.songs
    .filter((ps) => !ps.song.isHidden && !ps.song.archivedAt)
    .map((ps) => ({
      id: ps.song.id,
      title: ps.song.title,
      audioUrl: ps.song.audioUrl,
      imageUrl: ps.song.imageUrl,
      duration: ps.song.duration,
      tags: ps.song.tags,
    }));

  const totalDuration = visibleSongs.reduce(
    (sum, s) => sum + (s.duration ?? 0),
    0
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicPlaylist",
    name: playlist.name,
    description: playlist.description,
    creator: { "@type": "Person", name: creatorName },
    url: `${siteUrl}/p/${slug}`,
    numTracks: visibleSongs.length,
    dateCreated: playlist.createdAt.toISOString(),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white flex items-center justify-center p-4">
        <PublicPlaylistView
          playlistId={playlist.id}
          slug={slug}
          name={playlist.name}
          description={playlist.description}
          creatorName={creatorName}
          songs={visibleSongs}
          totalDuration={totalDuration}
          createdAt={playlist.createdAt.toISOString()}
          isPublished={playlist.isPublished}
          playCount={playlist.playCount}
        />
      </div>
    </>
  );
}
