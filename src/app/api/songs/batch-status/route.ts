import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/api-error";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId");

  if (!batchId || typeof batchId !== "string") {
    return badRequest("batchId query parameter is required");
  }

  const songs = await prisma.song.findMany({
    where: { batchId, userId },
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
}
