import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/error-logger";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const q = params.get("q")?.trim() || "";
    const status = params.get("status") || "";
    const minRating = parseInt(params.get("minRating") || "", 10);
    const sortBy = params.get("sortBy") || "newest";
    const sortDir = params.get("sortDir") || "";
    const dateFrom = params.get("dateFrom") || "";
    const dateTo = params.get("dateTo") || "";
    const tagId = params.get("tagId") || "";

    // Build WHERE conditions
    const where: Prisma.SongWhereInput = { userId: session.user.id };

    // Text search: title OR prompt (case-insensitive)
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { prompt: { contains: q, mode: "insensitive" } },
      ];
    }

    // Status filter
    if (status && ["ready", "pending", "failed"].includes(status)) {
      where.generationStatus = status;
    }

    // Rating filter (min stars)
    if (!isNaN(minRating) && minRating >= 1 && minRating <= 5) {
      where.rating = { gte: minRating };
    }

    // Date range
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!isNaN(from.getTime())) {
          (where.createdAt as Prisma.DateTimeFilter).gte = from;
        }
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (!isNaN(to.getTime())) {
          // Include the entire "dateTo" day
          to.setHours(23, 59, 59, 999);
          (where.createdAt as Prisma.DateTimeFilter).lte = to;
        }
      }
    }

    // Tag filter
    if (tagId) {
      where.songTags = { some: { tagId } };
    }

    // Build ORDER BY
    let orderBy: Prisma.SongOrderByWithRelationInput;
    switch (sortBy) {
      case "oldest":
        orderBy = { createdAt: "asc" };
        break;
      case "highest_rated":
        orderBy = { rating: { sort: "desc", nulls: "last" } };
        break;
      case "title_az":
        orderBy = { title: { sort: sortDir === "desc" ? "desc" : "asc", nulls: "last" } };
        break;
      case "newest":
      default:
        orderBy = { createdAt: "desc" };
        break;
    }

    // Pagination: cursor-based (default 20 items)
    const limitParam = parseInt(params.get("limit") || "", 10);
    const limit = !isNaN(limitParam) && limitParam >= 1 && limitParam <= 100 ? limitParam : 20;
    const cursor = params.get("cursor") || "";

    const [songs, total] = await Promise.all([
      prisma.song.findMany({
        where,
        orderBy,
        take: limit + 1, // fetch one extra to detect next page
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
          favorites: { where: { userId: session.user.id }, select: { id: true } },
          _count: { select: { favorites: true } },
        },
      }),
      prisma.song.count({ where }),
    ]);

    const hasMore = songs.length > limit;
    const sliced = hasMore ? songs.slice(0, limit) : songs;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

    const enriched = sliced.map((s) => {
      const { favorites, _count, ...rest } = s;
      return {
        ...rest,
        isFavorite: favorites.length > 0,
        favoriteCount: _count.favorites,
      };
    });

    return NextResponse.json({ songs: enriched, nextCursor, total });
  } catch (error) {
    logServerError("songs-list", error, { route: "/api/songs" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
