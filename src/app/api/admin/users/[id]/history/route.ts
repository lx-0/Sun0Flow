import { z } from "zod";
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { offsetPagination, pageSkip } from "@/lib/pagination";
import { zPaginationQuery } from "@/lib/query-params";

const historyQuery = zPaginationQuery(20, 100);

export const GET = adminRoute<{ id: string }, undefined, z.infer<typeof historyQuery>>(async (_request, { params, query }) => {
  const { page, limit } = query;

  const [songs, total] = await Promise.all([
    prisma.song.findMany({
      where: { userId: params.id },
      orderBy: { createdAt: "desc" },
      skip: pageSkip(page, limit),
      take: limit,
      select: {
        id: true,
        title: true,
        prompt: true,
        generationStatus: true,
        audioUrl: true,
        duration: true,
        createdAt: true,
      },
    }),
    prisma.song.count({ where: { userId: params.id } }),
  ]);

  return NextResponse.json({
    songs,
    ...offsetPagination(page, limit, total),
  });
}, { route: "/api/admin/users/[id]/history", query: historyQuery });
