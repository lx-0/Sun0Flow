import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi";
import { logServerError } from "@/lib/error-logger";
import { broadcast } from "@/lib/event-bus";
import { handleSongSuccess, handleSongFailure } from "@/lib/song-completion";
import { pollOnce, MAX_POLL_ATTEMPTS } from "@/lib/generation/completion";

export const GET = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { data: song, error } = requireOwned(
      await prisma.song.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Song",
    );
    if (error) return error;

    if (song.generationStatus === "ready" || song.generationStatus === "failed") {
      return NextResponse.json({ song });
    }

    if (!song.sunoJobId) {
      const updated = await prisma.song.update({
        where: { id: params.id },
        data: { generationStatus: "failed", errorMessage: "No Suno task ID" },
      });
      broadcast(song.userId, {
        type: "generation_update",
        data: { songId: params.id, status: "failed", errorMessage: updated.errorMessage },
      });
      return NextResponse.json({ song: updated });
    }

    const newPollCount = song.pollCount + 1;

    if (newPollCount > MAX_POLL_ATTEMPTS) {
      await handleSongFailure(song, "Generation timed out");
      const updated = await prisma.song.findUnique({ where: { id: params.id } });
      return NextResponse.json({ song: updated });
    }

    const userApiKey = await resolveUserApiKey(auth.userId);
    const outcome = await pollOnce(song.sunoJobId, userApiKey);

    switch (outcome.kind) {
      case "ready": {
        await handleSongSuccess(song, outcome.songs);
        const updated = await prisma.song.findUnique({ where: { id: params.id } });
        return NextResponse.json({ song: updated });
      }
      case "failed": {
        await handleSongFailure(song, outcome.errorMessage);
        const updated = await prisma.song.findUnique({ where: { id: params.id } });
        return NextResponse.json({ song: updated });
      }
      case "poll_error": {
        logServerError("status-poll", outcome.error, {
          userId: auth.userId,
          route: `/api/songs/${params.id}/status`,
          params: { songId: params.id, sunoJobId: song.sunoJobId, pollCount: newPollCount },
        });
        const updated = await prisma.song.update({
          where: { id: params.id },
          data: { pollCount: newPollCount },
        });
        return NextResponse.json({ song: updated });
      }
      case "processing": {
        const updated = await prisma.song.update({
          where: { id: params.id },
          data: { pollCount: newPollCount },
        });
        return NextResponse.json({ song: updated });
      }
    }
  },
  { route: "/api/songs/[id]/status" },
);
