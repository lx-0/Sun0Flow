import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { CacheControl } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const params = request.nextUrl.searchParams;
    const q = params.get("q")?.trim() || "";
    const status = params.get("status") || "";
    const sortBy = params.get("sortBy") || "recently_liked";

    // Pagination
    const limitParam = parseInt(params.get("limit") || "", 10);
    const limit = !isNaN(limitParam) && limitParam >= 1 && limitParam <= 100 ? limitParam : 20;
    const cursor = params.get("cursor") || "";

    // Build song WHERE conditions
    const songWhere: Prisma.SongWhereInput = { userId: userId };

    if (q) {
      songWhere.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { prompt: { contains: q, mode: "insensitive" } },
      ];
    }

    if (status && ["ready", "pending", "failed"].includes(status)) {
      songWhere.generationStatus = status;
    }

    // Build ORDER BY for favorites
    let favoriteOrderBy: Prisma.FavoriteOrderByWithRelationInput;
    switch (sortBy) {
      case "newest":
        favoriteOrderBy = { song: { createdAt: "desc" } };
        break;
      case "oldest":
        favoriteOrderBy = { song: { createdAt: "asc" } };
        break;
      case "title_az":
        favoriteOrderBy = { song: { title: { sort: "asc", nulls: "last" } } };
        break;
      case "recently_liked":
      default:
        favoriteOrderBy = { createdAt: "desc" };
        break;
    }

    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where: {
          userId: userId,
          song: songWhere,
        },
        include: {
          song: {
            include: {
              songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
              _count: { select: { favorites: true } },
            },
          },
        },
        orderBy: favoriteOrderBy,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.favorite.count({
        where: { userId: userId, song: songWhere },
      }),
    ]);

    const hasMore = favorites.length > limit;
    const sliced = hasMore ? favorites.slice(0, limit) : favorites;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

    const songs = sliced.map((f) => ({
      ...f.song,
      isFavorite: true,
      favoriteCount: f.song._count.favorites,
      favoritedAt: f.createdAt,
    }));

    return NextResponse.json({ songs, nextCursor, total }, {
      headers: { "Cache-Control": CacheControl.privateNoCache },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
