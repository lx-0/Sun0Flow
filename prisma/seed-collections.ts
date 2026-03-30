/**
 * Seed script: auto-generate curated collections from existing public song data.
 *
 * Run with:
 *   npx ts-node --project tsconfig.json -e "require('./prisma/seed-collections.ts')"
 * or via the npm script:
 *   npm run seed:collections
 *
 * Each collection is built by scanning public songs for matching keywords in their
 * `tags` field. Songs are ranked by playCount desc so the best content surfaces first.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COLLECTION_DEFINITIONS = [
  {
    title: "Chill Vibes",
    description:
      "Laid-back beats and mellow melodies perfect for unwinding.",
    theme: "chill",
    keywords: ["chill", "lo-fi", "lofi", "ambient", "relaxed", "calm", "peaceful", "mellow"],
    coverImage: null,
  },
  {
    title: "Workout Energy",
    description:
      "High-energy tracks to power through any workout.",
    theme: "workout",
    keywords: ["energetic", "workout", "pump", "hype", "intense", "powerful", "upbeat", "fast", "epic"],
    coverImage: null,
  },
  {
    title: "New This Week",
    description:
      "Fresh public songs added in the last 7 days.",
    theme: "new",
    keywords: [], // handled specially below via date filter
    coverImage: null,
  },
  {
    title: "Top Rated",
    description:
      "Highest-rated songs from the community.",
    theme: "top_rated",
    keywords: [], // handled specially below via rating filter
    coverImage: null,
  },
  {
    title: "Dark Moods",
    description:
      "Atmospheric, dark, and cinematic soundscapes.",
    theme: "dark",
    keywords: ["dark", "gothic", "noir", "cinematic", "atmospheric", "mysterious", "haunting", "melancholic"],
    coverImage: null,
  },
] as const;

/** Base where clause for public ready songs */
const PUBLIC_WHERE = {
  isPublic: true,
  isHidden: false,
  archivedAt: null as null,
  generationStatus: "ready",
} as const;

/** Fall back to all available songs (any status) when there is no public content yet */
async function availableSongIds(limit: number): Promise<string[]> {
  const songs = await prisma.song.findMany({
    where: { archivedAt: null, isHidden: false },
    orderBy: { playCount: "desc" },
    take: limit,
    select: { id: true },
  });
  return songs.map((s) => s.id);
}

async function buildTagCollection(
  keywords: readonly string[],
  limit = 20
): Promise<string[]> {
  if (keywords.length === 0) return [];

  // Find public ready songs whose tags field contains any keyword (case-insensitive)
  const conditions = keywords
    .map((kw) => `LOWER(tags) LIKE '%${kw.toLowerCase()}%'`)
    .join(" OR ");

  const songs = await prisma.$queryRawUnsafe<{ id: string }[]>(`
    SELECT id FROM "Song"
    WHERE "isPublic" = true
      AND "isHidden" = false
      AND "archivedAt" IS NULL
      AND "generationStatus" = 'ready'
      AND (${conditions})
    ORDER BY "playCount" DESC
    LIMIT ${limit}
  `);

  if (songs.length > 0) return songs.map((s) => s.id);

  // No public tagged songs — fall back to any available songs
  return availableSongIds(limit);
}

async function buildNewThisWeek(limit = 20): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const songs = await prisma.song.findMany({
    where: { ...PUBLIC_WHERE, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true },
  });

  if (songs.length > 0) return songs.map((s) => s.id);
  return availableSongIds(limit);
}

async function buildTopRated(limit = 20): Promise<string[]> {
  const songs = await prisma.song.findMany({
    where: { ...PUBLIC_WHERE, rating: { gte: 4 } },
    orderBy: [{ rating: "desc" }, { playCount: "desc" }],
    take: limit,
    select: { id: true },
  });

  if (songs.length > 0) return songs.map((s) => s.id);
  return availableSongIds(limit);
}

async function upsertCollection(
  def: (typeof COLLECTION_DEFINITIONS)[number],
  songIds: string[]
): Promise<void> {
  // Always create the collection even if empty — songs populate as content is added

  // Find or create by theme (idempotent re-runs)
  let collection = await prisma.collection.findFirst({
    where: { theme: def.theme },
  });

  if (!collection) {
    collection = await prisma.collection.create({
      data: {
        title: def.title,
        description: def.description,
        theme: def.theme,
        coverImage: def.coverImage ?? null,
        isPublic: true,
      },
    });
    console.log(`  Created collection "${def.title}" (${collection.id})`);
  } else {
    // Update metadata and clear existing songs so we can re-seed
    await prisma.collection.update({
      where: { id: collection.id },
      data: {
        title: def.title,
        description: def.description,
        updatedAt: new Date(),
      },
    });
    await prisma.collectionSong.deleteMany({ where: { collectionId: collection.id } });
    console.log(`  Updated collection "${def.title}" (${collection.id})`);
  }

  // Insert songs
  await prisma.collectionSong.createMany({
    data: songIds.map((songId, position) => ({
      collectionId: collection!.id,
      songId,
      position,
    })),
    skipDuplicates: true,
  });

  console.log(`    → ${songIds.length} songs added`);
}

async function main() {
  console.log("Seeding curated collections…\n");

  for (const def of COLLECTION_DEFINITIONS) {
    process.stdout.write(`Processing "${def.title}"…\n`);

    let songIds: string[];
    if (def.theme === "new") {
      songIds = await buildNewThisWeek();
    } else if (def.theme === "top_rated") {
      songIds = await buildTopRated();
    } else {
      songIds = await buildTagCollection(def.keywords);
    }

    await upsertCollection(def, songIds);
  }

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
