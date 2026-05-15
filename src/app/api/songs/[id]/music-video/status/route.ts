import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { getMusicVideoDetail, SunoApiError, resolveUserApiKey } from "@/lib/sunoapi";
import { logServerError } from "@/lib/error-logger";

const querySchema = z.object({
  taskId: z.string().min(1, "Missing required query parameter: taskId"),
});

export const GET = authRoute<{ id: string }, undefined, z.infer<typeof querySchema>>(
  async (_request, { auth, params, query }) => {
    const { error } = requireOwned(
      await prisma.song.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Song",
    );
    if (error) return error;

    if (query.taskId.startsWith("mock-video-")) {
      const mockVideoUrl = "https://example.com/mock-video.mp4";
      await prisma.song.update({
        where: { id: params.id },
        data: { videoUrl: mockVideoUrl },
      });
      return NextResponse.json({ status: "SUCCESS", videoUrl: mockVideoUrl });
    }

    const userApiKey = await resolveUserApiKey(auth.userId);

    let detail;
    try {
      detail = await getMusicVideoDetail(query.taskId, userApiKey);
    } catch (apiError) {
      logServerError("music-video-status-api", apiError, { userId: auth.userId, route: `/api/songs/${params.id}/music-video/status` });
      const message =
        apiError instanceof SunoApiError && apiError.status === 404
          ? "Music video task not found. The task ID may be invalid or expired."
          : "Failed to check music video status. Please try again.";
      return NextResponse.json({ error: message, code: "API_ERROR" }, { status: 502 });
    }

    const videoUrl = detail.response?.videoUrl ?? null;

    if (detail.successFlag === "SUCCESS" && videoUrl) {
      await prisma.song.update({
        where: { id: params.id },
        data: { videoUrl },
      });
    }

    return NextResponse.json({
      status: detail.successFlag,
      videoUrl,
      taskId: detail.taskId,
      errorMessage: detail.errorMessage ?? null,
    });
  },
  { query: querySchema, route: "/api/songs/[id]/music-video/status" },
);
