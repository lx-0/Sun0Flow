import { prisma } from "@/lib/prisma";
import { parseTags } from "@/lib/tags";

const MOOD_KEYWORDS = new Set([
  "energetic", "chill", "dark", "uplifting", "melancholic", "aggressive",
  "relaxed", "happy", "sad", "epic", "dreamy", "intense", "romantic",
  "mysterious", "peaceful", "angry", "nostalgic", "euphoric", "somber",
  "atmospheric", "hypnotic", "groovy", "emotional", "powerful", "calm",
  "experimental",
]);

export interface SeedCriteria {
  mood: string;
  genre: string;
}

export async function deriveSeedCriteria(
  seedSongId: string,
  userId: string,
): Promise<SeedCriteria> {
  const seed = await prisma.song.findFirst({
    where: {
      id: seedSongId,
      OR: [{ userId }, { isPublic: true }],
      generationStatus: "ready",
    },
    select: { tags: true },
  });

  if (!seed?.tags) return { mood: "", genre: "" };

  const tags = parseTags(seed.tags);
  return {
    mood: tags.find((t) => MOOD_KEYWORDS.has(t)) || "",
    genre: tags.find((t) => !MOOD_KEYWORDS.has(t) && t.length > 2) || "",
  };
}
