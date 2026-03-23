import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicSongView } from "./PublicSongView";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

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
        include: { user: { select: { name: true } } },
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white flex items-center justify-center p-4">
        <PublicSongView
          songId={song.id}
          title={title}
          imageUrl={song.imageUrl}
          audioUrl={song.audioUrl}
          duration={song.duration}
          tags={song.tags}
          creatorName={song.user.name}
          prompt={song.prompt}
          createdAt={song.createdAt.toISOString()}
        />
      </div>
    </>
  );
}
