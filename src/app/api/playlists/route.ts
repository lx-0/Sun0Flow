import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/sanitize";
import { CacheControl, CacheTTL, cached, invalidateByPrefix, cacheKey } from "@/lib/cache";

const MAX_PLAYLISTS = 50;

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const playlists = await cached(
      cacheKey("playlists", userId),
      () =>
        prisma.playlist.findMany({
          where: { userId: userId },
          include: { _count: { select: { songs: true } } },
          orderBy: { updatedAt: "desc" },
        }),
      CacheTTL.PLAYLIST
    );

    return NextResponse.json({ playlists }, {
      headers: { "Cache-Control": CacheControl.privateShort },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (name.trim().length > 100) {
      return NextResponse.json(
        { error: "Name must be 100 characters or less", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (description && typeof description === "string" && description.length > 1000) {
      return NextResponse.json(
        { error: "Description must be 1000 characters or less", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const count = await prisma.playlist.count({
      where: { userId: userId },
    });

    if (count >= MAX_PLAYLISTS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_PLAYLISTS} playlists reached`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const playlist = await prisma.playlist.create({
      data: {
        name: stripHtml(name).trim(),
        description: description ? stripHtml(description).trim() || null : null,
        userId: userId,
      },
      include: { _count: { select: { songs: true } } },
    });

    invalidateByPrefix(cacheKey("playlists", userId));
    return NextResponse.json({ playlist }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
