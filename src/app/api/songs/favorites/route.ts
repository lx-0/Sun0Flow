import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { CacheControl } from "@/lib/cache";
import {
  zTrimmedParam,
  zLimitParam,
  zCursorParam,
  zEnumParam,
} from "@/lib/query-params";
import { cursorPaginate } from "@/lib/pagination";

const favoritesQuery = z.object({
  q: zTrimmedParam,
  status: zTrimmedParam,
  sortBy: zEnumParam(
    ["recently_liked", "newest", "oldest", "title_az"] as const,
    "recently_liked",
  ),
  limit: zLimitParam(20, 100),
  cursor: zCursorParam,
});

export const GET = authRoute(
  async (_request, { auth, query }) => {
    const songWhere: Prisma.SongWhereInput = { userId: auth.userId };

    if (query.q) {
      songWhere.OR = [
        { title: { contains: query.q, mode: "insensitive" } },
        { prompt: { contains: query.q, mode: "insensitive" } },
      ];
    }

    if (
      query.status &&
      ["ready", "pending", "failed"].includes(query.status)
    ) {
      songWhere.generationStatus = query.status;
    }

    let favoriteOrderBy: Prisma.FavoriteOrderByWithRelationInput;
    switch (query.sortBy) {
      case "newest":
        favoriteOrderBy = { song: { createdAt: "desc" } };
        break;
      case "oldest":
        favoriteOrderBy = { song: { createdAt: "asc" } };
        break;
      case "title_az":
        favoriteOrderBy = {
          song: { title: { sort: "asc", nulls: "last" } },
        };
        break;
      case "recently_liked":
      default:
        favoriteOrderBy = { createdAt: "desc" };
        break;
    }

    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where: {
          userId: auth.userId,
          song: songWhere,
        },
        include: {
          song: {
            include: {
              songTags: {
                include: { tag: true },
                orderBy: { tag: { name: "asc" } },
              },
              _count: { select: { favorites: true } },
            },
          },
        },
        orderBy: favoriteOrderBy,
        take: query.limit + 1,
        ...(query.cursor
          ? { cursor: { id: query.cursor }, skip: 1 }
          : {}),
      }),
      prisma.favorite.count({
        where: { userId: auth.userId, song: songWhere },
      }),
    ]);

    const { items: sliced, nextCursor } = cursorPaginate(favorites, query.limit);

    const songs = sliced.map((f) => ({
      ...f.song,
      isFavorite: true,
      favoriteCount: f.song._count.favorites,
      favoritedAt: f.createdAt,
    }));

    return NextResponse.json(
      { songs, nextCursor, total },
      { headers: { "Cache-Control": CacheControl.privateNoCache } },
    );
  },
  { route: "/api/songs/favorites", query: favoritesQuery },
);
