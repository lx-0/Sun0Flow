import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/sanitize";
import { notifyUser } from "@/lib/notifications";
import { success, Err, type CommentResult } from "./result";

// ── Constants ──────────────────────────────────────────────────────────────────

const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 1000;
const MAX_BODY_LENGTH = 500;
const PAGE_SIZE = 20;

// ── Public types ───────────────────────────────────────────────────────────────

export interface CommentEntry {
  id: string;
  body: string;
  timestamp: number | null;
  createdAt: Date;
  user: { id: string; name: string | null; image: string | null };
}

export interface CommentPage {
  comments: CommentEntry[];
  pagination: {
    page: number;
    totalPages: number;
    total: number;
    hasMore: boolean;
  };
}

export interface CreateCommentInput {
  body: unknown;
  timestamp?: unknown;
}

// ── Projections ────────────────────────────────────────────────────────────────

const COMMENT_SELECT = {
  id: true,
  body: true,
  timestamp: true,
  createdAt: true,
  user: { select: { id: true, name: true, image: true } },
} as const;

// ── Internal helpers ───────────────────────────────────────────────────────────

async function checkRateLimit(userId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const recentCount = await prisma.rateLimitEntry.count({
    where: { userId, action: "comment", createdAt: { gte: windowStart } },
  });
  return recentCount < RATE_LIMIT;
}

async function checkDuplicate(
  songId: string,
  userId: string,
  text: string,
): Promise<boolean> {
  const existing = await prisma.comment.findFirst({
    where: {
      songId,
      userId,
      body: text,
      createdAt: { gte: new Date(Date.now() - WINDOW_MS) },
    },
    select: { id: true },
  });
  return existing !== null;
}

function validateBody(raw: unknown): CommentResult<string> {
  const text = typeof raw === "string" ? stripHtml(raw).trim() : "";
  if (!text || text.length > MAX_BODY_LENGTH) {
    return Err.validation(`Comment body must be 1–${MAX_BODY_LENGTH} characters`);
  }
  return success(text);
}

function validateTimestamp(raw: unknown): CommentResult<number | null> {
  if (raw === undefined || raw === null) return success(null);
  const ts = Number(raw);
  if (!isFinite(ts) || ts < 0) return Err.validation("Invalid timestamp");
  return success(ts);
}

async function notifyOwner(
  song: { id: string; title: string | null; userId: string | null },
  commenterId: string,
  commenterName: string | null,
) {
  if (!song.userId || song.userId === commenterId) return;
  try {
    await notifyUser({
      userId: song.userId,
      type: "song_comment",
      title: "New comment",
      message: `${commenterName ?? "Someone"} commented on "${song.title ?? "your song"}"`,
      href: `/songs/${song.id}`,
      songId: song.id,
      push: { tag: `song-comment-${song.id}` },
    });
  } catch {
    // Non-critical
  }
}

// ── Public interface ───────────────────────────────────────────────────────────

export async function listComments(
  songId: string,
  page: number,
): Promise<CommentResult<CommentPage>> {
  const take = PAGE_SIZE;
  const skip = (Math.max(1, page) - 1) * take;

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: { songId },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take,
      select: COMMENT_SELECT,
    }),
    prisma.comment.count({ where: { songId } }),
  ]);

  return success({
    comments,
    pagination: {
      page: Math.max(1, page),
      totalPages: Math.ceil(total / take),
      total,
      hasMore: skip + take < total,
    },
  });
}

export async function createComment(
  songId: string,
  userId: string,
  input: CreateCommentInput,
): Promise<CommentResult<CommentEntry>> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, title: true, isPublic: true, isHidden: true, userId: true },
  });

  if (!song || !song.isPublic || song.isHidden) {
    return Err.notFound("Song not found");
  }

  const allowed = await checkRateLimit(userId);
  if (!allowed) {
    return Err.rateLimited("Too many comments. Please wait a moment.");
  }

  const bodyResult = validateBody(input.body);
  if (!bodyResult.ok) return bodyResult;
  const text = bodyResult.data;

  const isDupe = await checkDuplicate(songId, userId, text);
  if (isDupe) {
    return Err.duplicate("Duplicate comment. Please wait before posting the same text again.");
  }

  const tsResult = validateTimestamp(input.timestamp);
  if (!tsResult.ok) return tsResult;

  const [comment] = await prisma.$transaction([
    prisma.comment.create({
      data: { songId, userId, body: text, timestamp: tsResult.data },
      select: COMMENT_SELECT,
    }),
    prisma.rateLimitEntry.create({ data: { userId, action: "comment" } }),
  ]);

  await notifyOwner(song, userId, comment.user.name);

  return success(comment);
}
