import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicSongView } from "@/app/s/[slug]/PublicSongView";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

/**
 * Safely serialize data for use in a <script type="application/ld+json"> tag.
 * Replacing <, >, and & with Unicode escapes prevents XSS via script injection.
 */
function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** ISR: revalidate public song pages every 60 seconds */
export const revalidate = 60;

const getSongById = cache((songId: string) =>
  cached(
    cacheKey("public-song-id", songId),
    () =>
      prisma.song.findUnique({
        where: { id: songId },
        include: { user: { select: { name: true } } },
      }),
    CacheTTL.PUBLIC_SONG
  )
);

export async function generateMetadata({
  params,
}: {
  params: { songId: string };
}): Promise<Metadata> {
  const song = await getSongById(params.songId);

  if (!song || !song.isPublic || song.isHidden || song.archivedAt) {
    return { robots: { index: false } };
  }

  const title = song.title ?? "Untitled";
  const creatorName = song.user.name ?? "Unknown Artist";
  const description = song.prompt
    ? song.prompt.slice(0, 200)
    : `Listen to "${title}" by ${creatorName} on SunoFlow`;
  const canonicalUrl = song.publicSlug
    ? `${siteUrl}/s/${song.publicSlug}`
    : `${siteUrl}/songs/${params.songId}`;

  return {
    title: `${title} by ${creatorName}`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${title} by ${creatorName}`,
      description,
      url: canonicalUrl,
      type: "music.song",
      siteName: "SunoFlow",
      images: song.imageUrl
        ? [{ url: song.imageUrl, alt: title }]
        : [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "SunoFlow" }],
      ...(song.audioUrl ? { audio: [{ url: song.audioUrl, type: "audio/mpeg" }] } : {}),
    },
    twitter: {
      card: song.audioUrl ? "player" : "summary_large_image",
      title: `${title} by ${creatorName}`,
      description,
      images: song.imageUrl ? [song.imageUrl] : ["/icons/icon-512.png"],
    },
  };
}

export default async function PublicSongByIdPage({
  params,
}: {
  params: { songId: string };
}) {
  const song = await getSongById(params.songId);

  if (!song || !song.isPublic || song.isHidden || song.archivedAt) {
    notFound();
  }

  const title = song.title ?? "Untitled";
  const creatorName = song.user.name ?? "Unknown Artist";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: title,
    byArtist: { "@type": "Person", name: creatorName },
    url: song.publicSlug
      ? `${siteUrl}/s/${song.publicSlug}`
      : `${siteUrl}/songs/${params.songId}`,
    ...(song.duration
      ? { duration: `PT${Math.floor(song.duration / 60)}M${Math.floor(song.duration % 60)}S` }
      : {}),
    ...(song.imageUrl ? { image: song.imageUrl } : {}),
    ...(song.audioUrl
      ? { audio: { "@type": "AudioObject", contentUrl: song.audioUrl, encodingFormat: "audio/mpeg" } }
      : {}),
    dateCreated: song.createdAt.toISOString(),
  };

  // Prefer the slug-based URL for sharing; fall back to the ID-based URL
  const shareSlug = song.publicSlug ?? params.songId;
  const shareReturnUrl = song.publicSlug
    ? `/s/${song.publicSlug}`
    : `/songs/${params.songId}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white flex items-center justify-center p-4">
        <PublicSongView
          songId={song.id}
          slug={shareSlug}
          returnUrl={shareReturnUrl}
          title={title}
          imageUrl={song.imageUrl}
          audioUrl={song.audioUrl}
          duration={song.duration}
          tags={song.tags}
          creatorName={song.user.name}
          songOwnerId={song.userId}
          prompt={song.prompt}
          createdAt={song.createdAt.toISOString()}
        />
      </div>
    </>
  );
}
