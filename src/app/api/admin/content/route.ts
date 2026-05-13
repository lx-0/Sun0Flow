import { z } from "zod";
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { offsetPagination, pageSkip } from "@/lib/pagination";
import { zEnumParam, zPaginationQuery } from "@/lib/query-params";

const contentQuery = zPaginationQuery(20, 100).extend({
  filter: zEnumParam(["all", "flagged", "public"] as const, "all"),
});

export const GET = adminRoute<Record<string, never>, undefined, z.infer<typeof contentQuery>>(async (_request, { query }) => {
  const { page, limit, filter } = query;

  const where =
    filter === "flagged"
      ? { isHidden: true }
      : filter === "public"
      ? { isPublic: true, isHidden: false }
      : {};

  const [songs, total] = await Promise.all([
    prisma.song.findMany({
      where,
      select: {
        id: true,
        title: true,
        generationStatus: true,
        isPublic: true,
        isHidden: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { reports: { where: { status: "pending" } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: pageSkip(page, limit),
      take: limit,
    }),
    prisma.song.count({ where }),
  ]);

  const result = songs.map((s) => ({
    id: s.id,
    title: s.title,
    generationStatus: s.generationStatus,
    isPublic: s.isPublic,
    isHidden: s.isHidden,
    createdAt: s.createdAt,
    creator: { id: s.user.id, name: s.user.name, email: s.user.email },
    pendingReports: s._count.reports,
  }));

  return NextResponse.json({
    songs: result,
    ...offsetPagination(page, limit, total),
  });
}, { route: "/api/admin/content", query: contentQuery });
