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

    const where = { ...buildDiscoverableFilter(), userId: user.userId };

    const [songs, total] = await Promise.all([
      prisma.song.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pageSlice(query.page),
        select: publicProfileSongSelect,
      }),
      prisma.song.count({ where }),
    ]);

    return NextResponse.json({
      songs,
      pagination: pagedResponse(query.page, total),
    });
  },
  { query: pageQuery, route: "/api/u/[username]/songs" }
);
