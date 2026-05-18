import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { buildDiscoverableFilter } from "@/lib/songs";
import {
  pageQuery,
  pagedResponse,
  pageSlice,
  publicProfileSongSelect,
  resolveRouteUsernameOrResponse,
} from "../route-shared";

export const GET = publicRoute<{ username: string }, undefined, z.infer<typeof pageQuery>>(
  async (_request, { params, query }) => {
    const user = await resolveRouteUsernameOrResponse(params.username);
    if ("status" in user) return user;

    const where = {
      userId: user.userId,
      song: buildDiscoverableFilter(),
    };

    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pageSlice(query.page),
        select: {
          song: {
            select: publicProfileSongSelect,
          },
        },
      }),
      prisma.favorite.count({ where }),
    ]);

    return NextResponse.json({
      songs: favorites.map((f) => f.song),
      pagination: pagedResponse(query.page, total),
    });
  },
  { query: pageQuery, route: "/api/u/[username]/liked-songs" }
);
