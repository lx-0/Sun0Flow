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

    const songs = await prisma.song.findMany({
      where,
      orderBy,
      include: { songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } } },
    });

    return NextResponse.json({ songs });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
