import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, unauthorized } from "@/lib/api-error";

const REACTION_RATE_LIMIT = 30;
const REACTION_WINDOW_MS = 60 * 1000; // 1 minute

// Validate that a string is a single emoji character
function isSingleEmoji(str: string): boolean {
  if (!str) return false;
  // Match exactly one emoji (including emoji sequences like family/flag emojis)
  const emojiRegex = /^\p{Emoji_Presentation}$|^\p{Emoji}\uFE0F$|^\p{Emoji_Modifier_Base}\p{Emoji_Modifier}$|^[\u{1F1E0}-\u{1F1FF}][\u{1F1E0}-\u{1F1FF}]$/u;
  // Also handle basic emoticons like :)
  // Use segmenter to count grapheme clusters
  const segmenter = new Intl.Segmenter();
  const segments = [...segmenter.segment(str)];
  if (segments.length !== 1) return false;
  // Verify it's an emoji character
  const codePoint = str.codePointAt(0);
  if (!codePoint) return false;
  // Check emoji ranges
  return emojiRegex.test(str) ||
    (codePoint >= 0x1F300 && codePoint <= 0x1FAFF) ||
    (codePoint >= 0x2600 && codePoint <= 0x27BF) ||
    (codePoint >= 0xFE00 && codePoint <= 0xFE0F);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const after = searchParams.get("after");
    const take = 20;

    // Get song to check visibility
    const song = await prisma.song.findUnique({
      where: { id },
      select: { id: true, userId: true, isPublic: true, isHidden: true },
    });

    if (!song || song.isHidden) {
      return NextResponse.json(
        { error: "Song not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Private songs require auth + ownership
    if (!song.isPublic) {
      const session = await auth();
      if (!session?.user?.id) {
        return unauthorized();
      }
      if (session.user.id !== song.userId) {
        return forbidden();
      }
    }

    // Build cursor condition
    const cursorCondition = after
      ? { id: { gt: after } as { gt: string } }
      : undefined;

    const reactions = await prisma.songReaction.findMany({
      where: { songId: id, ...(cursorCondition ? cursorCondition : {}) },
      orderBy: { timestamp: "asc" },
      take,
      select: {
        id: true,
        emoji: true,
        timestamp: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    const nextCursor =
      reactions.length === take ? reactions[reactions.length - 1].id : null;

    return NextResponse.json({ reactions, nextCursor });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id } = await params;

    // Get song to validate it exists and get duration
    const song = await prisma.song.findUnique({
      where: { id },
      select: { id: true, duration: true, isHidden: true },
    });

    if (!song || song.isHidden) {
      return NextResponse.json(
        { error: "Song not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const { emoji, timestamp } = body as { emoji?: unknown; timestamp?: unknown };

    // Validate emoji
    if (typeof emoji !== "string" || !isSingleEmoji(emoji)) {
      return badRequest("emoji must be a single emoji character");
    }

    // Validate timestamp
    if (typeof timestamp !== "number" || isNaN(timestamp) || timestamp < 0) {
      return badRequest("timestamp must be a non-negative number");
    }

    if (song.duration !== null && song.duration !== undefined && timestamp > song.duration) {
      return badRequest(`timestamp must be within song duration (${song.duration}s)`);
    }

    // Rate limit: 30 reactions per user per song per minute
    const windowStart = new Date(Date.now() - REACTION_WINDOW_MS);
    const recentCount = await prisma.rateLimitEntry.count({
      where: {
        userId,
        action: `reaction:${id}`,
        createdAt: { gte: windowStart },
      },
    });

    if (recentCount >= REACTION_RATE_LIMIT) {
      return NextResponse.json(
        { error: "Too many reactions. Please wait a moment.", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }

    // Create reaction (handle unique constraint)
    try {
      const [reaction] = await prisma.$transaction([
        prisma.songReaction.create({
          data: { songId: id, userId, emoji, timestamp },
          select: {
            id: true,
            emoji: true,
            timestamp: true,
            createdAt: true,
            user: { select: { id: true, name: true, image: true } },
          },
        }),
        prisma.rateLimitEntry.create({ data: { userId, action: `reaction:${id}` } }),
      ]);

      return NextResponse.json(reaction, { status: 201 });
    } catch (err: unknown) {
      // Unique constraint violation — return existing reaction
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        const existing = await prisma.songReaction.findFirst({
          where: { songId: id, userId, emoji, timestamp },
          select: {
            id: true,
            emoji: true,
            timestamp: true,
            createdAt: true,
            user: { select: { id: true, name: true, image: true } },
          },
        });
        if (existing) {
          return NextResponse.json(existing, { status: 409 });
        }
      }
      throw err;
    }
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
