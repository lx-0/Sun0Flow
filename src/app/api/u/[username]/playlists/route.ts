import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, offsetPagination, pageSkip } from "@/lib/pagination";
import { zPageParam } from "@/lib/query-params";
import { errorFromResult } from "@/lib/api-error";
import { resolveUserIdByUsername } from "@/lib/profile";

const pageQuery = z.object({ page: zPageParam() });

export const GET = publicRoute<{ username: string }, undefined, z.infer<typeof pageQuery>>(
  async (_request, { params, query }) => {
    const userResult = await resolveUserIdByUsername(params.username);
    if (!userResult.ok) return errorFromResult(userResult);

    const [playlists, total] = await Promise.all([
      prisma.playlist.findMany({
        where: { userId: userResult.data.id, isPublic: true },
        orderBy: { updatedAt: "desc" },
        skip: pageSkip(query.page, DEFAULT_PAGE_SIZE),
        take: DEFAULT_PAGE_SIZE,
        select: {
          id: true,
          name: true,
          description: true,
          slug: true,
          createdAt: true,
          _count: {
            select: { songs: { where: { song: { archivedAt: null } } } },
          },
          songs: {
            take: 1,
            orderBy: { position: "asc" },
            select: {
              song: { select: { imageUrl: true } },
            },
          },
        },
      }),
      prisma.playlist.count({
        where: { userId: userResult.data.id, isPublic: true },
      }),
    ]);

    return NextResponse.json({
      playlists: playlists.map((pl) => ({
        id: pl.id,
        name: pl.name,
        description: pl.description,
        slug: pl.slug,
        songCount: pl._count.songs,
        coverImage: pl.songs[0]?.song.imageUrl ?? null,
        createdAt: pl.createdAt,
      })),
      pagination: offsetPagination(query.page, DEFAULT_PAGE_SIZE, total),
    });
  },
  { query: pageQuery, route: "/api/u/[username]/playlists" }
);
