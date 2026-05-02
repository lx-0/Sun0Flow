import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export const GET = authRoute(async (request, { auth }) => {
  const params = request.nextUrl.searchParams;
  const status = params.get("status") || "";
  const source = params.get("source") || "";
  const q = params.get("q")?.trim() || "";
  const dateFrom = params.get("dateFrom") || "";
  const dateTo = params.get("dateTo") || "";
  const sortBy = params.get("sortBy") || "newest";
  const cursor = params.get("cursor") || "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { userId: auth.userId };

  if (status && status !== "all") {
    where.generationStatus = status;
  }

  if (source && source !== "all") {
    where.source = source;
  }

  if (q.length >= 2) {
    where.prompt = { contains: q, mode: "insensitive" };
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  if (cursor) {
    where.createdAt = {
      ...where.createdAt,
      lt: new Date(cursor),
    };
  }

  const orderBy = sortBy === "oldest" ? { createdAt: "asc" as const } : { createdAt: "desc" as const };

  const [songs, total] = await Promise.all([
    prisma.song.findMany({
      where,
      orderBy,
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        title: true,
        prompt: true,
        tags: true,
        audioUrl: true,
        imageUrl: true,
        duration: true,
        generationStatus: true,
        errorMessage: true,
        isInstrumental: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.song.count({ where: { userId: auth.userId, ...(status && status !== "all" ? { generationStatus: status } : {}), ...(source && source !== "all" ? { source } : {}) } }),
  ]);

  const hasMore = songs.length > PAGE_SIZE;
  const page = hasMore ? songs.slice(0, PAGE_SIZE) : songs;
  const nextCursor = hasMore ? page[page.length - 1]?.createdAt?.toISOString() : null;

  return NextResponse.json({ songs: page, nextCursor, total });
}, { route: "/api/generations" });
