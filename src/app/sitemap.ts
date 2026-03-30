import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

const ITEMS_PER_SITEMAP = 5000;

// ID ranges for each content type (allows up to 100 sitemaps per type = 500k URLs each)
const SONGS_ID_OFFSET = 0;
const PLAYLISTS_ID_OFFSET = 100;
const USERS_ID_OFFSET = 200;
const STATIC_ID = 300;

export async function generateSitemaps() {
  const [songCount, playlistCount, userCount] = await Promise.all([
    prisma.song.count({
      where: { isPublic: true, isHidden: false, archivedAt: null },
    }),
    prisma.playlist.count({ where: { isPublic: true } }),
    prisma.user.count({ where: { username: { not: null } } }),
  ]);

  const songPages = Math.max(1, Math.ceil(songCount / ITEMS_PER_SITEMAP));
  const playlistPages = Math.max(1, Math.ceil(playlistCount / ITEMS_PER_SITEMAP));
  const userPages = Math.max(1, Math.ceil(userCount / ITEMS_PER_SITEMAP));

  const ids: { id: number }[] = [{ id: STATIC_ID }];

  for (let i = 0; i < songPages; i++) {
    ids.push({ id: SONGS_ID_OFFSET + i });
  }
  for (let i = 0; i < playlistPages; i++) {
    ids.push({ id: PLAYLISTS_ID_OFFSET + i });
  }
  for (let i = 0; i < userPages; i++) {
    ids.push({ id: USERS_ID_OFFSET + i });
  }

  return ids;
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  // Static pages
  if (id === STATIC_ID) {
    return [
      {
        url: siteUrl,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 1.0,
      },
      {
        url: `${siteUrl}/discover`,
        lastModified: new Date(),
        changeFrequency: "hourly",
        priority: 0.9,
      },
      {
        url: `${siteUrl}/explore`,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 0.8,
      },
      {
        url: `${siteUrl}/pricing`,
        lastModified: new Date(),
        changeFrequency: "monthly",
        priority: 0.6,
      },
    ];
  }

  // Songs
  if (id >= SONGS_ID_OFFSET && id < PLAYLISTS_ID_OFFSET) {
    const page = id - SONGS_ID_OFFSET;
    const songs = await prisma.song.findMany({
      where: { isPublic: true, isHidden: false, archivedAt: null },
      select: { publicSlug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      skip: page * ITEMS_PER_SITEMAP,
      take: ITEMS_PER_SITEMAP,
    });

    return songs
      .filter((s) => s.publicSlug)
      .map((song) => ({
        url: `${siteUrl}/s/${song.publicSlug}`,
        lastModified: song.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
  }

  // Playlists
  if (id >= PLAYLISTS_ID_OFFSET && id < USERS_ID_OFFSET) {
    const page = id - PLAYLISTS_ID_OFFSET;
    const playlists = await prisma.playlist.findMany({
      where: { isPublic: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      skip: page * ITEMS_PER_SITEMAP,
      take: ITEMS_PER_SITEMAP,
    });

    return playlists
      .filter((p) => p.slug)
      .map((playlist) => ({
        url: `${siteUrl}/p/${playlist.slug}`,
        lastModified: playlist.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
  }

  // Users
  if (id >= USERS_ID_OFFSET && id < STATIC_ID) {
    const page = id - USERS_ID_OFFSET;
    const users = await prisma.user.findMany({
      where: { username: { not: null } },
      select: { username: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      skip: page * ITEMS_PER_SITEMAP,
      take: ITEMS_PER_SITEMAP,
    });

    return users
      .filter((u) => u.username)
      .map((user) => ({
        url: `${siteUrl}/u/${user.username}`,
        lastModified: user.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
  }

  return [];
}
