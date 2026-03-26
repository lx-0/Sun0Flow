import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { internalError } from "@/lib/api-error";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const params = request.nextUrl.searchParams;
    const status = params.get("status") || "";
    const source = params.get("source") || "";
    const q = params.get("q")?.trim() || "";
    const dateFrom = params.get("dateFrom") || "";
    const dateTo = params.get("dateTo") || "";
    const sortBy = params.get("sortBy") || "newest";
    const cursor = params.get("cursor") || "";

    // Build WHERE clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = { userId };

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
        // Include the whole day
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
      prisma.song.count({ where: { userId, ...(status && status !== "all" ? { generationStatus: status } : {}), ...(source && source !== "all" ? { source } : {}) } }),
    ]);

    const hasMore = songs.length > PAGE_SIZE;
    const page = hasMore ? songs.slice(0, PAGE_SIZE) : songs;
    const nextCursor = hasMore ? page[page.length - 1]?.createdAt?.toISOString() : null;

    return NextResponse.json({ songs: page, nextCursor, total });
  } catch (error) {
    logServerError("generations-route", error, { route: "/api/generations" });
    return internalError();
  }
}
