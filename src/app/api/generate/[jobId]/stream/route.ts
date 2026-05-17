import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi";
import { broadcast } from "@/lib/event-bus";
import { pollToCompletion } from "@/lib/generation/completion";
import { authRoute } from "@/lib/route-handler";
import { logServerError } from "@/lib/error-logger";
import { markSongFailedSimple } from "@/lib/songs/lifecycle";
import { createSSEResponse, encodeSSEComment, encodeSSEEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";

export const GET = authRoute<{ jobId: string }>(async (request, { auth, params }) => {
  const { jobId } = params;

  const song = await prisma.song.findUnique({ where: { id: jobId } });
  if (!song || song.userId !== auth.userId) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  function sendEvent(
    controller: ReadableStreamDefaultController,
    type: string,
    data: Record<string, unknown>
  ) {
    controller.enqueue(encodeSSEEvent(type, data));
  }

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encodeSSEComment("connected"));

      if (
        song.generationStatus === "ready" ||
        song.generationStatus === "failed"
      ) {
        sendEvent(controller, "generation_update", {
          songId: jobId,
          status: song.generationStatus,
          title: song.title,
          errorMessage: song.errorMessage,
        });
        controller.close();
        return;
      }

      if (!song.sunoJobId) {
        await markSongFailedSimple(jobId, "No Suno task ID");
        const failData = { songId: jobId, status: "failed", errorMessage: "No Suno task ID" };
        broadcast(song.userId, { type: "generation_update", data: failData });
        sendEvent(controller, "generation_update", failData);
        controller.close();
        return;
      }

      const userApiKey = await resolveUserApiKey(auth.userId);

      // Run the poll loop independent of the SSE connection lifecycle. If the
      // client disconnects (tab close, navigation) we still want Suno's result
      // to land in the DB — handleSongSuccess / handleSongFailure persist
      // regardless of who's listening. The SSE stream is a best-effort
      // forwarder; once it closes, sendEvent throws and we stop forwarding,
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
          try {
            sendEvent(controller, "generation_update", { ...update });
          } catch {
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
          try {
            sendEvent(controller, "generation_update", {
              songId: jobId,
              status: "failed",
              errorMessage: "Generation stream error — will retry in background",
            });
          } catch {
            // controller already closed
          }
        }
      }

      try {
        controller.close();
      } catch {
        // Already closed
      }
    },
  });

  return createSSEResponse(stream);
}, { route: "/api/generate/[jobId]/stream" });
