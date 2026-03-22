import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const publicSongs = await prisma.song.findMany({
    where: { isPublic: true, isHidden: false },
    select: { publicSlug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });

  const songEntries: MetadataRoute.Sitemap = publicSongs
    .filter((s) => s.publicSlug)
    .map((song) => ({
      url: `${siteUrl}/s/${song.publicSlug}`,
      lastModified: song.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    ...songEntries,
  ];
}
