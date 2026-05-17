import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, offsetPagination, pageSkip } from "@/lib/pagination";
import { buildDiscoverableFilter } from "@/lib/songs";
import { zPageParam } from "@/lib/query-params";
import { errorFromResult } from "@/lib/api-error";
import { resolveUserIdByUsername } from "@/lib/profile";

const pageQuery = z.object({ page: zPageParam() });

export const GET = publicRoute<{ username: string }, undefined, z.infer<typeof pageQuery>>(
  async (_request, { params, query }) => {
    const userResult = await resolveUserIdByUsername(params.username);
    if (!userResult.ok) return errorFromResult(userResult);

    const where = {
      userId: userResult.data.id,
      song: buildDiscoverableFilter(),
    };

    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pageSkip(query.page, DEFAULT_PAGE_SIZE),
        take: DEFAULT_PAGE_SIZE,
        select: {
          song: {
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
          },
        },
      }),
      prisma.favorite.count({ where }),
    ]);

    return NextResponse.json({
      songs: favorites.map((f) => f.song),
      pagination: offsetPagination(query.page, DEFAULT_PAGE_SIZE, total),
    });
  },
  { query: pageQuery, route: "/api/u/[username]/liked-songs" }
);
