import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

const batchStatusQuery = z.object({
  batchId: z.string().min(1, "batchId query parameter is required"),
});

export const GET = authRoute<Record<string, never>, undefined, z.infer<typeof batchStatusQuery>>(async (_request, { auth, query }) => {
  const batchId = query.batchId;

  const songs = await prisma.song.findMany({
    where: { batchId, userId: auth.userId },
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
      sunoJobId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (songs.length === 0) {
    return NextResponse.json(
      { error: "Batch not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  const pending = songs.filter((s) => s.generationStatus === "pending").length;
  const ready = songs.filter((s) => s.generationStatus === "ready").length;
  const failed = songs.filter((s) => s.generationStatus === "failed").length;

  let overallStatus: "pending" | "complete" | "partial" | "failed";
  if (ready === songs.length) {
    overallStatus = "complete";
  } else if (failed === songs.length) {
    overallStatus = "failed";
  } else if (pending > 0) {
    overallStatus = "pending";
  } else {
    overallStatus = "partial";
  }

  return NextResponse.json({
    batchId,
    status: overallStatus,
    songs,
    summary: {
      total: songs.length,
      pending,
      ready,
      failed,
    },
  });
}, { route: "/api/songs/batch-status", query: batchStatusQuery });
