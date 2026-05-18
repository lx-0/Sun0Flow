import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { safeJsonLd } from "@/lib/json-ld";
import { PublicProfileView } from "./PublicProfileView";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

/** ISR: revalidate public profile pages every 60 seconds */
export const revalidate = 60;

const getProfile = cache((username: string) =>
  prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      avatarUrl: true,
      bannerUrl: true,
      bio: true,
      featuredSongId: true,
      createdAt: true,
      _count: {
        select: {
          followers: true,
          following: true,
          songs: {
            where: { isPublic: true, isHidden: false, archivedAt: null, generationStatus: "ready" },
          },
        },
      },
    },
  })
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const user = await getProfile(username);

  if (!user) {
    return { robots: { index: false } };
  }

  const displayName = user.name ?? user.username;
  const description = user.bio
    ? user.bio.slice(0, 200)
    : `${displayName}'s music profile on SunoFlow — ${user._count.songs} public songs`;
  const canonicalUrl = `${siteUrl}/u/${user.username}`;
  const ogImage = user.avatarUrl ?? user.image ?? `${siteUrl}/icons/icon-512.png`;

  return {
    title: `${displayName} (@${user.username}) · SunoFlow`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${displayName} on SunoFlow`,
      description,
      url: canonicalUrl,
      type: "profile",
      siteName: "SunoFlow",
      images: [{ url: ogImage, alt: displayName ?? undefined }],
    },
    twitter: {
      card: "summary",
      title: `${displayName} on SunoFlow`,
      description,
      images: [ogImage],
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await getProfile(username);

  if (!user || !user.username) {
    notFound();
  }

  // Fetch featured song if set
  let featuredSong = null;
  if (user.featuredSongId) {
    featuredSong = await prisma.song.findFirst({
      where: {
        id: user.featuredSongId,
        userId: user.id,
        isPublic: true,
        isHidden: false,
        archivedAt: null,
      },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        audioUrl: true,
        duration: true,
        tags: true,
        publicSlug: true,
      },
    });
  }

  // Compute total plays
  const playStats = await prisma.song.aggregate({
    where: { userId: user.id, isPublic: true, isHidden: false, archivedAt: null },
    _sum: { playCount: true },
  });

  const displayName = user.name ?? user.username;
  const canonicalUrl = `${siteUrl}/u/${user.username}`;
  const ogImage = user.avatarUrl ?? user.image ?? `${siteUrl}/icons/icon-512.png`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: displayName,
    url: canonicalUrl,
    image: ogImage,
    description: user.bio ?? undefined,
    memberOf: {
      "@type": "WebSite",
      name: "SunoFlow",
      url: siteUrl,
    },
  };

  const profile = {
    id: user.id,
    name: user.name,
    username: user.username,
    image: user.image,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
    followersCount: user._count.followers,
    followingCount: user._count.following,
    publicSongsCount: user._count.songs,
    totalPlays: playStats._sum.playCount ?? 0,
    featuredSong: featuredSong ? normalizeFeaturedSong(featuredSong) : null,
    isFollowing: false, // server render — actual value loaded client-side via API
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <PublicProfileView profile={profile} />
    </>
  );
}
function normalizeFeaturedSong(song: {
  id: string;
  title: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  tags: string | null;
  publicSlug: string | null;
}) {
  return {
    id: song.id,
    title: song.title ?? "Untitled",
    imageUrl: song.imageUrl,
    audioUrl: song.audioUrl,
    duration: song.duration,
    tags: song.tags,
    publicSlug: song.publicSlug,
  };
}
