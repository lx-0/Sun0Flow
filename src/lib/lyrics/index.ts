import { prisma } from "@/lib/prisma";
import { generateText } from "@/lib/llm";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
export {
  listLyricAnnotations,
  listLyricTimestamps,
  replaceLyricTimestamps,
  upsertLyricAnnotation,
} from "./crud";

const SYSTEM_PROMPT =
  "Generate original song lyrics inspired by the style of the reference lyrics. " +
  "Never copy — create new original content. " +
  "Match the mood and style but with fresh words and ideas.";

const MAX_REFERENCE_SONGS = 5;

// ── Types ───────────────────────────────────────────────────────────────

export type GenerateLyricsResult =
  | {
      ok: true;
      lyrics: string;
      referenceSongs: Array<{ id: string; title: string | null }>;
    }
  | { ok: false; code: "RATE_LIMITED"; resetAt: string; retryAfterSec: number }
  | { ok: false; code: "GENERATION_FAILED" };

// ── Core ────────────────────────────────────────────────────────────────

export async function generateLyrics(
  userId: string,
  prompt: string
): Promise<GenerateLyricsResult> {
  const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(
    userId,
    "lyrics_generate"
  );
  if (!acquired) {
    const resetAt = new Date(rateLimitStatus.resetAt);
    const retryAfterSec = Math.ceil(
      (resetAt.getTime() - Date.now()) / 1000
    );
    return {
      ok: false,
      code: "RATE_LIMITED",
      resetAt: rateLimitStatus.resetAt,
      retryAfterSec: Math.max(1, retryAfterSec),
    };
  }

  const referenceSongs = await selectReferenceSongs(userId);
  const userPrompt = buildPrompt(prompt, referenceSongs);
  const lyrics = await generateText(SYSTEM_PROMPT, userPrompt);

  if (!lyrics) {
    return { ok: false, code: "GENERATION_FAILED" };
  }

  return {
    ok: true,
    lyrics,
    referenceSongs: referenceSongs.map((s) => ({ id: s.id, title: s.title })),
  };
}

// ── Internals ───────────────────────────────────────────────────────────

interface ReferenceSong {
  id: string;
  title: string | null;
  lyrics: string | null;
}

async function selectReferenceSongs(userId: string): Promise<ReferenceSong[]> {
  const favoriteSongs = await prisma.song.findMany({
    where: {
      userId,
      favorites: { some: { userId } },
      lyrics: { not: null },
    },
    orderBy: [{ rating: "desc" }, { downloadCount: "desc" }],
    take: MAX_REFERENCE_SONGS,
    select: { id: true, title: true, lyrics: true },
  });

  if (favoriteSongs.length >= MAX_REFERENCE_SONGS) {
    return favoriteSongs;
  }

  const existingIds = favoriteSongs.map((s) => s.id);
  const ratedSongs = await prisma.song.findMany({
    where: {
      userId,
      rating: { not: null },
      lyrics: { not: null },
      id: { notIn: existingIds },
    },
    orderBy: [{ rating: "desc" }, { downloadCount: "desc" }],
    take: MAX_REFERENCE_SONGS - favoriteSongs.length,
    select: { id: true, title: true, lyrics: true },
  });

  return [...favoriteSongs, ...ratedSongs];
}

function buildPrompt(prompt: string, referenceSongs: ReferenceSong[]): string {
  if (referenceSongs.length === 0) {
    return `Theme/mood/topic: ${prompt.trim()}`;
  }

  const referenceContext = referenceSongs
    .map(
      (s, i) =>
        `--- Reference ${i + 1}: "${s.title ?? "Untitled"}" ---\n${s.lyrics}`
    )
    .join("\n\n");

  return `Theme/mood/topic: ${prompt.trim()}\n\nReference lyrics for style inspiration:\n\n${referenceContext}`;
}
