import { prisma } from "@/lib/prisma";
import { success, Err, type ReactionResult } from "./result";

// ── Constants ──────────────────────────────────────────────────────────────────

const RATE_LIMIT = 30;
const WINDOW_MS = 60 * 1000;
const PAGE_SIZE = 20;

// ── Public types ───────────────────────────────────────────────────────────────

export interface ReactionEntry {
  id: string;
  emoji: string;
  timestamp: number;
  createdAt: Date;
  user: { id: string; name: string | null; image: string | null };
}

export interface ReactionPage {
  reactions: ReactionEntry[];
  nextCursor: string | null;
}

export interface CreateReactionInput {
  emoji: unknown;
  timestamp: unknown;
}

// ── Projections ────────────────────────────────────────────────────────────────

const REACTION_SELECT = {
  id: true,
  emoji: true,
  timestamp: true,
  createdAt: true,
  user: { select: { id: true, name: true, image: true } },
} as const;

// ── Internal helpers ───────────────────────────────────────────────────────────

function isSingleEmoji(str: string): boolean {
  if (!str || str.length > 16) return false;
  const segments = Array.from(new Intl.Segmenter().segment(str));
  if (segments.length !== 1) return false;
  const codePoint = str.codePointAt(0);
  if (!codePoint) return false;
  return (
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x2600 && codePoint <= 0x27bf) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0x1f1e0 && codePoint <= 0x1f1ff) ||
    (codePoint >= 0x200d && codePoint <= 0x200d) ||
    (codePoint >= 0x2300 && codePoint <= 0x23ff) ||
    (codePoint >= 0x2b50 && codePoint <= 0x2b55) ||
    (codePoint >= 0xe0020 && codePoint <= 0xe007f) ||
    str.includes("️")
  );
}

function validateEmoji(raw: unknown): ReactionResult<string> {
  if (typeof raw !== "string" || !isSingleEmoji(raw)) {
    return Err.validation("emoji must be a single emoji character");
  }
  return success(raw);
}

function validateTimestamp(
  raw: unknown,
  songDuration: number | null | undefined,
): ReactionResult<number> {
  if (typeof raw !== "number" || isNaN(raw) || raw < 0) {
    return Err.validation("timestamp must be a non-negative number");
  }
  if (songDuration !== null && songDuration !== undefined && raw > songDuration) {
    return Err.validation(`timestamp must be within song duration (${songDuration}s)`);
  }
  return success(raw);
}

async function checkRateLimit(
  userId: string,
  songId: string,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const recentCount = await prisma.rateLimitEntry.count({
    where: {
      userId,
      action: `reaction:${songId}`,
      createdAt: { gte: windowStart },
    },
  });
  return recentCount < RATE_LIMIT;
}

// ── Public interface ───────────────────────────────────────────────────────────

export async function listReactions(
  songId: string,
  userId: string | null,
  after: string | null,
): Promise<ReactionResult<ReactionPage>> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, userId: true, isPublic: true, isHidden: true },
  });

  if (!song || song.isHidden) {
    return Err.notFound("Song not found");
  }

  if (!song.isPublic) {
    if (!userId || userId !== song.userId) {
      return Err.forbidden();
    }
  }

  const cursorCondition = after ? { id: { gt: after } as { gt: string } } : undefined;

  const reactions = await prisma.songReaction.findMany({
    where: { songId, ...(cursorCondition ?? {}) },
    orderBy: { timestamp: "asc" },
    take: PAGE_SIZE,
    select: REACTION_SELECT,
  });

  const nextCursor =
    reactions.length === PAGE_SIZE ? reactions[reactions.length - 1].id : null;

  return success({ reactions, nextCursor });
}

export async function createReaction(
  songId: string,
  userId: string,
  input: CreateReactionInput,
): Promise<ReactionResult<ReactionEntry>> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, duration: true, isHidden: true },
  });

  if (!song || song.isHidden) {
    return Err.notFound("Song not found");
  }

  const emojiResult = validateEmoji(input.emoji);
  if (!emojiResult.ok) return emojiResult;
  const emoji = emojiResult.data;

  const tsResult = validateTimestamp(input.timestamp, song.duration);
  if (!tsResult.ok) return tsResult;
  const timestamp = tsResult.data;

  const allowed = await checkRateLimit(userId, songId);
  if (!allowed) {
    return Err.rateLimited("Too many reactions. Please wait a moment.");
  }

  try {
    const [reaction] = await prisma.$transaction([
      prisma.songReaction.create({
        data: { songId, userId, emoji, timestamp },
        select: REACTION_SELECT,
      }),
      prisma.rateLimitEntry.create({
        data: { userId, action: `reaction:${songId}` },
      }),
    ]);

    return success(reaction);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      const existing = await prisma.songReaction.findFirst({
        where: { songId, userId, emoji, timestamp },
        select: REACTION_SELECT,
      });
      if (existing) {
        return Err.conflict("Reaction already exists");
      }
    }
    throw err;
  }
}
