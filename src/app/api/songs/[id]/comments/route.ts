import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { sendPushToUser } from "@/lib/push";
import { stripHtml } from "@/lib/sanitize";

const COMMENT_RATE_LIMIT = 10;
const COMMENT_WINDOW_MS = 60 * 1000; // 1 minute

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const take = 20;
    const skip = (page - 1) * take;

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { songId: id },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
        select: {
          id: true,
          body: true,
          timestamp: true,
          createdAt: true,
          user: {
            select: { id: true, name: true, image: true },
          },
        },
      }),
      prisma.comment.count({ where: { songId: id } }),
    ]);

    return NextResponse.json({
      comments,
      pagination: {
        page,
        totalPages: Math.ceil(total / take),
        total,
        hasMore: skip + take < total,
      },
    });
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
  const { id } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    // Verify song exists and is public
    const song = await prisma.song.findUnique({
      where: { id },
      select: { id: true, title: true, isPublic: true, isHidden: true, userId: true },
    });

    if (!song || !song.isPublic || song.isHidden) {
      return NextResponse.json(
        { error: "Song not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Rate limit: 10 comments per user per minute
    const windowStart = new Date(Date.now() - COMMENT_WINDOW_MS);
    const recentCount = await prisma.rateLimitEntry.count({
      where: { userId, action: "comment", createdAt: { gte: windowStart } },
    });

    if (recentCount >= COMMENT_RATE_LIMIT) {
      return NextResponse.json(
        { error: "Too many comments. Please wait a moment.", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }

    const body = await request.json();
    const rawText = typeof body?.body === "string" ? stripHtml(body.body).trim() : "";

    if (!rawText || rawText.length > 500) {
      return NextResponse.json(
        { error: "Comment body must be 1–500 characters", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const text = rawText;

    // Duplicate text protection: reject same text by same user on same song within 1 minute
    const dupeCheck = await prisma.comment.findFirst({
      where: {
        songId: id,
        userId,
        body: text,
        createdAt: { gte: new Date(Date.now() - COMMENT_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (dupeCheck) {
      return NextResponse.json(
        { error: "Duplicate comment. Please wait before posting the same text again.", code: "DUPLICATE_COMMENT" },
        { status: 429 }
      );
    }

    // Optional timestamp (seconds into the song)
    let timestamp: number | null = null;
    if (body?.timestamp !== undefined && body?.timestamp !== null) {
      const ts = Number(body.timestamp);
      if (!isFinite(ts) || ts < 0) {
        return NextResponse.json(
          { error: "Invalid timestamp", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
      timestamp = ts;
    }

    const [comment] = await prisma.$transaction([
      prisma.comment.create({
        data: { songId: id, userId, body: text, timestamp },
        select: {
          id: true,
          body: true,
          timestamp: true,
          createdAt: true,
          user: { select: { id: true, name: true, image: true } },
        },
      }),
      prisma.rateLimitEntry.create({ data: { userId, action: "comment" } }),
    ]);

    // Notify song owner (skip if commenter is the owner)
    if (song.userId && song.userId !== userId) {
      try {
        const commenterName = comment.user.name ?? "Someone";
        const songTitle = song.title ?? "your song";
        const songOwner = await prisma.user.findUnique({
          where: { id: song.userId },
          select: { pushSongComment: true },
        });
        await createNotification({
          userId: song.userId,
          type: "song_comment",
          title: "New comment",
          message: `${commenterName} commented on "${songTitle}"`,
          href: `/songs/${song.id}`,
          songId: song.id,
        });
        if (songOwner?.pushSongComment !== false) {
          sendPushToUser(song.userId, {
            title: "New comment on your song",
            body: `${commenterName} commented on "${songTitle}"`,
            url: `/songs/${song.id}`,
            tag: `song-comment-${song.id}`,
          }).catch(() => {});
        }
      } catch {
        // Non-critical — don't fail the comment creation
      }
    }

    return NextResponse.json(comment, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
