import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicSongView } from "./PublicSongView";

async function getSong(slug: string) {
  return prisma.song.findUnique({
    where: { publicSlug: slug },
    include: { user: { select: { name: true } } },
  });
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const song = await getSong(params.slug);

  if (!song || !song.isPublic) {
    return { robots: { index: false } };
  }

  const title = song.title ?? "Untitled";
  const creatorName = song.user.name ?? "Unknown Artist";
  const description = song.prompt
    ? song.prompt.slice(0, 200)
    : `Listen to "${title}" by ${creatorName} on SunoFlow`;

  return {
    title: `${title} by ${creatorName} — SunoFlow`,
    description,
    openGraph: {
      title: `${title} by ${creatorName}`,
      description,
      type: "music.song",
      ...(song.imageUrl ? { images: [{ url: song.imageUrl, alt: title }] } : {}),
      ...(song.audioUrl ? { audio: [{ url: song.audioUrl, type: "audio/mpeg" }] } : {}),
    },
    twitter: {
      card: song.audioUrl ? "player" : "summary_large_image",
      title: `${title} by ${creatorName}`,
      description,
      ...(song.imageUrl ? { images: [song.imageUrl] } : {}),
    },
  };
}

export default async function PublicSongPage({
  params,
}: {
  params: { slug: string };
}) {
  const song = await getSong(params.slug);

  if (!song || !song.isPublic) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white flex items-center justify-center p-4">
      <PublicSongView
        title={song.title ?? "Untitled"}
        imageUrl={song.imageUrl}
        audioUrl={song.audioUrl}
        duration={song.duration}
        tags={song.tags}
        creatorName={song.user.name}
      />
    </div>
  );
}
