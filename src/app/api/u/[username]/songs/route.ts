import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, offsetPagination, pageSkip } from "@/lib/pagination";
import { buildDiscoverableFilter } from "@/lib/songs";
import { zPageParam } from "@/lib/query-params";
import { notFound } from "@/lib/api-error";

const pageQuery = z.object({ page: zPageParam() });

export const GET = publicRoute<{ username: string }, undefined, z.infer<typeof pageQuery>>(
  async (_request, { params, query }) => {
    const user = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true },
    });

    if (!user) return notFound("User not found");

    const where = { ...buildDiscoverableFilter(), userId: user.id };

    const [songs, total] = await Promise.all([
      prisma.song.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pageSkip(query.page, DEFAULT_PAGE_SIZE),
        take: DEFAULT_PAGE_SIZE,
        select: {
          id: true,
          title: true,
          imageUrl: true,
          audioUrl: true,
          duration: true,
          tags: true,
          publicSlug: true,
          playCount: true,
          createdAt: true,
        },
      }),
      prisma.song.count({ where }),
    ]);

    return NextResponse.json({
      songs,
      pagination: offsetPagination(query.page, DEFAULT_PAGE_SIZE, total),
    });
  },
  { query: pageQuery, route: "/api/u/[username]/songs" }
);
