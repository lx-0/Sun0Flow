import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { getMusicVideoDetail, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";

/** GET /api/songs/[id]/music-video/status?taskId=<taskId> — poll music video generation status */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id: songId } = await params;

    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song || song.userId !== userId) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const url = new URL(request.url);
    const taskId = url.searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json(
        { error: "Missing required query parameter: taskId", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (taskId.startsWith("mock-video-")) {
      const mockVideoUrl = "https://example.com/mock-video.mp4";
      await prisma.song.update({
        where: { id: songId },
        data: { videoUrl: mockVideoUrl },
      });
      return NextResponse.json({ status: "SUCCESS", videoUrl: mockVideoUrl });
    }

    const userApiKey = await resolveUserApiKey(userId);

    let detail;
    try {
      detail = await getMusicVideoDetail(taskId, userApiKey);
    } catch (apiError) {
      logServerError("music-video-status-api", apiError, { userId, route: `/api/songs/${songId}/music-video/status` });
      const message =
        apiError instanceof SunoApiError && apiError.status === 404
          ? "Music video task not found. The task ID may be invalid or expired."
          : "Failed to check music video status. Please try again.";
      return NextResponse.json({ error: message, code: "API_ERROR" }, { status: 502 });
    }

    const videoUrl = detail.response?.videoUrl ?? null;

    if (detail.successFlag === "SUCCESS" && videoUrl) {
      await prisma.song.update({
        where: { id: songId },
        data: { videoUrl },
      });
    }

    return NextResponse.json({
      status: detail.successFlag,
      videoUrl,
      taskId: detail.taskId,
      errorMessage: detail.errorMessage ?? null,
    });
  } catch (error) {
    logServerError("music-video-status-route", error, { route: "/api/songs/music-video/status" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
