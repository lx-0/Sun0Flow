import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const q = params.get("q")?.trim() || "";
    const status = params.get("status") || "";
    const sortBy = params.get("sortBy") || "recently_liked";

    // Build song WHERE conditions
    const songWhere: Prisma.SongWhereInput = { userId: session.user.id };

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

    const favorites = await prisma.favorite.findMany({
      where: {
        userId: session.user.id,
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
    });

    const songs = favorites.map((f) => ({
      ...f.song,
      isFavorite: true,
      favoriteCount: f.song._count.favorites,
      favoritedAt: f.createdAt,
    }));

    return NextResponse.json({ songs });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
