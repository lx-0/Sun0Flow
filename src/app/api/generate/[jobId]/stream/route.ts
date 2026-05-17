import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi";
import { broadcast } from "@/lib/event-bus";
import { pollToCompletion } from "@/lib/generation/completion";
import { authRoute } from "@/lib/route-handler";
import { logServerError } from "@/lib/error-logger";
import { markSongFailedSimple } from "@/lib/songs/lifecycle";
import { closeSSE, createSSEStream, createSSEResponse, enqueueSSEEvent } from "@/lib/sse";
import { notFound } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = authRoute<{ jobId: string }>(async (request, { auth, params }) => {
  const { jobId } = params;

  const song = await prisma.song.findUnique({ where: { id: jobId } });
  if (!song || song.userId !== auth.userId) {
    return notFound("Song not found");
  }

  const stream = createSSEStream({
    request,
    async onStart(controller) {
      if (
        song.generationStatus === "ready" ||
        song.generationStatus === "failed"
      ) {
        enqueueSSEEvent(controller, "generation_update", {
          songId: jobId,
          status: song.generationStatus,
          title: song.title,
          errorMessage: song.errorMessage,
        });
        closeSSE(controller);
        return;
      }

      if (!song.sunoJobId) {
        await markSongFailedSimple(jobId, "No Suno task ID");
        const failData = { songId: jobId, status: "failed", errorMessage: "No Suno task ID" };
        broadcast(song.userId, { type: "generation_update", data: failData });
        enqueueSSEEvent(controller, "generation_update", failData);
        closeSSE(controller);
        return;
      }

      const userApiKey = await resolveUserApiKey(auth.userId);

      // Run the poll loop independent of the SSE connection lifecycle. If the
      // client disconnects (tab close, navigation) we still want Suno's result
      // to land in the DB — handleSongSuccess / handleSongFailure persist
      // regardless of who's listening. The SSE stream is a best-effort
      // forwarder; once it closes, enqueueSSEEvent returns false and forwarding stops,
      // but the generator keeps iterating to completion.
      const updates = pollToCompletion({
        songId: jobId,
        userId: auth.userId,
        sunoJobId: song.sunoJobId,
        apiKey: userApiKey,
        currentPollCount: song.pollCount,
        existingSong: {
          title: song.title,
          prompt: song.prompt,
          tags: song.tags,
          audioUrl: song.audioUrl,
          imageUrl: song.imageUrl,
          duration: song.duration,
          lyrics: song.lyrics,
          sunoModel: song.sunoModel,
          isInstrumental: song.isInstrumental,
        },
      });

      let streamOpen = true;
      try {
        for await (const update of updates) {
          if (!streamOpen) continue;
          if (!enqueueSSEEvent(controller, "generation_update", { ...update })) {
            streamOpen = false;
          }
        }
      } catch (err) {
        // pollToCompletion (or one of its side effects) threw. Log it,
        // surface a terminal failed event to the client so the UI doesn't
        // hang on a perpetual spinner. The DB row may still be `pending` —
        // the stale-pending recovery sweep on /api/songs is the backstop.
        logServerError("generation-stream-error", err, {
          userId: auth.userId,
          route: "/api/generate/[jobId]/stream",
          params: { songId: jobId, sunoJobId: song.sunoJobId },
        });
        if (streamOpen) {
          enqueueSSEEvent(controller, "generation_update", {
            songId: jobId,
            status: "failed",
            errorMessage: "Generation stream error — will retry in background",
          });
        }
      }

      closeSSE(controller);
    },
    onAbort(controller) {
      closeSSE(controller);
    },
  });

  return createSSEResponse(stream);
}, { route: "/api/generate/[jobId]/stream" });
