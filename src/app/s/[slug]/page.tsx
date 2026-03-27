import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicSongView } from "./PublicSongView";
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

/** ISR: revalidate public song pages every 60 seconds */
export const revalidate = 60;

/**
 * React cache() deduplicates within a single request (metadata + page render).
 * LRU cache deduplicates across requests (60s TTL).
 */
const getSong = cache((slug: string) =>
  cached(
    cacheKey("public-song", slug),
    () =>
      prisma.song.findUnique({
        where: { publicSlug: slug },
        include: { user: { select: { name: true, username: true } } },
      }),
    CacheTTL.PUBLIC_SONG
  )
);

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const song = await getSong(params.slug);

  if (!song || !song.isPublic || song.isHidden || song.archivedAt) {
    return { robots: { index: false } };
  }

  const title = song.title ?? "Untitled";
  const creatorName = song.user.name ?? "Unknown Artist";
  const description = song.prompt
    ? song.prompt.slice(0, 200)
    : `Listen to "${title}" by ${creatorName} on SunoFlow`;
  const canonicalUrl = `${siteUrl}/s/${params.slug}`;
  const fallbackImageUrl = `${siteUrl}/icons/icon-512.png`;

  const ogImages = song.imageUrl
    ? [{ url: song.imageUrl, alt: title }]
    : [{ url: fallbackImageUrl, width: 512, height: 512, alt: "SunoFlow" }];

  const twitterImages = song.imageUrl ? [song.imageUrl] : [fallbackImageUrl];

  const twitterMeta: Metadata["twitter"] = song.audioUrl
    ? {
        card: "player",
        title: `${title} by ${creatorName}`,
        description,
        images: twitterImages,
        players: [
          {
            playerUrl: `${siteUrl}/embed/${song.id}`,
            streamUrl: song.audioUrl,
            width: 480,
            height: 200,
          },
        ],
      }
    : {
        card: "summary_large_image",
        title: `${title} by ${creatorName}`,
        description,
        images: twitterImages,
      };

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
      images: ogImages,
      ...(song.audioUrl ? { audio: [{ url: song.audioUrl, type: "audio/mpeg" }] } : {}),
    },
    twitter: twitterMeta,
  };
}

export default async function PublicSongPage({
  params,
}: {
  params: { slug: string };
}) {
  const song = await getSong(params.slug);

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
    url: `${siteUrl}/s/${params.slug}`,
    ...(song.duration ? { duration: `PT${Math.floor(song.duration / 60)}M${song.duration % 60}S` } : {}),
    ...(song.imageUrl ? { image: song.imageUrl } : {}),
    ...(song.audioUrl ? { audio: { "@type": "AudioObject", contentUrl: song.audioUrl, encodingFormat: "audio/mpeg" } } : {}),
    dateCreated: song.createdAt.toISOString(),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white flex items-center justify-center p-4">
        <PublicSongView
          songId={song.id}
          slug={params.slug}
          title={title}
          imageUrl={song.imageUrl}
          audioUrl={song.audioUrl}
          duration={song.duration}
          tags={song.tags}
          creatorName={song.user.name}
          creatorUsername={song.user.username}
          songOwnerId={song.userId}
          prompt={song.prompt}
          createdAt={song.createdAt.toISOString()}
        />
      </div>
    </>
  );
}
