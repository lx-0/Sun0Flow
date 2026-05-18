import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { pageQuery, pagedResponse, pageSlice, resolveRouteUsernameOrResponse } from "../route-shared";

export const GET = publicRoute<{ username: string }, undefined, z.infer<typeof pageQuery>>(
  async (_request, { params, query }) => {
    const user = await resolveRouteUsernameOrResponse(params.username);
    if ("status" in user) return user;

    const [playlists, total] = await Promise.all([
      prisma.playlist.findMany({
        where: { userId: user.userId, isPublic: true },
        orderBy: { updatedAt: "desc" },
        ...pageSlice(query.page),
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
        where: { userId: user.userId, isPublic: true },
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
      pagination: pagedResponse(query.page, total),
    });
  },
  { query: pageQuery, route: "/api/u/[username]/playlists" }
);
