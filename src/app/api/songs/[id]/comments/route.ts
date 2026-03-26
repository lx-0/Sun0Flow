import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const COMMENT_RATE_LIMIT = 10;
const COMMENT_WINDOW_MS = 60 * 1000; // 1 minute

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const take = 20;
    const skip = (page - 1) * take;

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { songId: params.id },
        // Timestamped comments sorted by position; untimstamped fall to end by createdAt
        orderBy: [{ timestamp: "asc" }, { createdAt: "desc" }],
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
      prisma.comment.count({ where: { songId: params.id } }),
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
  { params }: { params: { id: string } }
) {
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
      where: { id: params.id },
      select: { id: true, isPublic: true, isHidden: true },
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
    const text = typeof body?.body === "string" ? body.body.trim() : "";

    if (!text || text.length > 280) {
      return NextResponse.json(
        { error: "Comment body must be 1–280 characters", code: "VALIDATION_ERROR" },
        { status: 400 }
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
        data: { songId: params.id, userId, body: text, timestamp },
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

    return NextResponse.json(comment, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
