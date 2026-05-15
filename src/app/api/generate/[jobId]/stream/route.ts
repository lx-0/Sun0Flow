import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi";
import { broadcast } from "@/lib/event-bus";
import { pollToCompletion } from "@/lib/generation/completion";
import { authRoute } from "@/lib/route-handler";

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

  const encoder = new TextEncoder();

  function sendEvent(
    controller: ReadableStreamDefaultController,
    type: string,
    data: Record<string, unknown>
  ) {
    const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(payload));
  }

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

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
        await prisma.song.update({
          where: { id: jobId },
          data: { generationStatus: "failed", errorMessage: "No Suno task ID", archivedAt: new Date() },
        });
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
      for await (const update of updates) {
        if (!streamOpen) continue;
        try {
          sendEvent(controller, "generation_update", { ...update });
        } catch {
          streamOpen = false;
        }
      }

      try {
        controller.close();
      } catch {
        // Already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}, { route: "/api/generate/[jobId]/stream" });
