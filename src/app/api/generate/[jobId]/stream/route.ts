import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { broadcast } from "@/lib/event-bus";
import { pollToCompletion } from "@/lib/generation/completion";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const { jobId } = await params;

  const song = await prisma.song.findUnique({ where: { id: jobId } });
  if (!song || song.userId !== userId) {
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
          data: { generationStatus: "failed", errorMessage: "No Suno task ID" },
        });
        const failData = { songId: jobId, status: "failed", errorMessage: "No Suno task ID" };
        broadcast(song.userId, { type: "generation_update", data: failData });
        sendEvent(controller, "generation_update", failData);
        controller.close();
        return;
      }

      const userApiKey = await resolveUserApiKey(userId);

      const updates = pollToCompletion(
        {
          songId: jobId,
          userId,
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
        },
        request.signal,
      );

      for await (const update of updates) {
        sendEvent(controller, "generation_update", { ...update });
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
}
