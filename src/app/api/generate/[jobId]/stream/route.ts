import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTaskStatus } from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { invalidateByPrefix } from "@/lib/cache";
import { broadcast } from "@/lib/event-bus";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 60;

/**
 * SSE endpoint that streams generation status updates for a specific song.
 * Server-side polls the Suno API and pushes updates, replacing client-side polling.
 */
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

      // If already terminal, send final state and close
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
        const updated = await prisma.song.update({
          where: { id: jobId },
          data: {
            generationStatus: "failed",
            errorMessage: "No Suno task ID",
          },
        });
        broadcast(song.userId, {
          type: "generation_update",
          data: {
            songId: jobId,
            status: "failed",
            errorMessage: updated.errorMessage,
          },
        });
        sendEvent(controller, "generation_update", {
          songId: jobId,
          status: "failed",
          errorMessage: updated.errorMessage,
        });
        controller.close();
        return;
      }

      const userApiKey = await resolveUserApiKey(userId);
      let pollCount = song.pollCount;
      let aborted = false;

      request.signal.addEventListener("abort", () => {
        aborted = true;
      });

      // Server-side polling loop
      while (!aborted) {
        pollCount += 1;

        if (pollCount > MAX_POLL_ATTEMPTS) {
          const updated = await prisma.song.update({
            where: { id: jobId },
            data: {
              generationStatus: "failed",
              pollCount,
              errorMessage: "Generation timed out",
            },
          });
          broadcast(song.userId, {
            type: "generation_update",
            data: {
              songId: jobId,
              status: "failed",
              errorMessage: "Generation timed out",
            },
          });
          sendEvent(controller, "generation_update", {
            songId: jobId,
            status: "failed",
            errorMessage: updated.errorMessage,
          });
          break;
        }

        let taskResult;
        try {
          taskResult = await getTaskStatus(song.sunoJobId, userApiKey);
        } catch (pollError) {
          logServerError("stream-poll", pollError, {
            userId,
            route: `/api/generate/${jobId}/stream`,
            params: {
              songId: jobId,
              sunoJobId: song.sunoJobId,
              pollCount,
            },
          });
          // Transient error — update count and continue
          await prisma.song.update({
            where: { id: jobId },
            data: { pollCount },
          });
          sendEvent(controller, "generation_update", {
            songId: jobId,
            status: "processing",
            pollCount,
          });
          await sleep(POLL_INTERVAL_MS);
          continue;
        }

        const isComplete = taskResult.status === "SUCCESS";
        const isFailed =
          taskResult.status === "CREATE_TASK_FAILED" ||
          taskResult.status === "GENERATE_AUDIO_FAILED" ||
          taskResult.status === "CALLBACK_EXCEPTION" ||
          taskResult.status === "SENSITIVE_WORD_ERROR";

        if (isComplete && taskResult.songs.length > 0) {
          const firstSong = taskResult.songs[0];
          const updated = await prisma.song.update({
            where: { id: jobId },
            data: {
              generationStatus: "ready",
              audioUrl: firstSong.audioUrl || song.audioUrl,
              imageUrl: firstSong.imageUrl || song.imageUrl,
              duration: firstSong.duration ?? song.duration,
              lyrics: firstSong.lyrics || song.lyrics,
              title: firstSong.title || song.title,
              tags: firstSong.tags || song.tags,
              sunoModel: firstSong.model || song.sunoModel,
              pollCount,
            },
          });

          // Create alternate songs
          for (let i = 1; i < taskResult.songs.length; i++) {
            const extra = taskResult.songs[i];
            const alternateSong = await prisma.song.create({
              data: {
                userId: song.userId,
                sunoJobId: extra.id || null,
                title: extra.title || song.title,
                prompt: song.prompt,
                tags: extra.tags || song.tags,
                audioUrl: extra.audioUrl || null,
                imageUrl: extra.imageUrl || null,
                duration: extra.duration ?? null,
                lyrics: extra.lyrics || null,
                sunoModel: extra.model || null,
                isInstrumental: song.isInstrumental,
                generationStatus: "ready",
                parentSongId: jobId,
              },
            });
            broadcast(song.userId, {
              type: "generation_update",
              data: {
                songId: alternateSong.id,
                parentSongId: jobId,
                status: "ready",
                title: alternateSong.title,
                audioUrl: alternateSong.audioUrl,
                imageUrl: alternateSong.imageUrl,
              },
            });
          }

          const alternateCount = taskResult.songs.length - 1;
          invalidateByPrefix(`dashboard-stats:${song.userId}`);
          const eventData = {
            songId: jobId,
            status: "ready" as const,
            title: updated.title,
            audioUrl: updated.audioUrl,
            imageUrl: updated.imageUrl,
            alternateCount,
          };
          broadcast(song.userId, {
            type: "generation_update",
            data: eventData,
          });
          sendEvent(controller, "generation_update", eventData);
          break;
        }

        if (isFailed) {
          const updated = await prisma.song.update({
            where: { id: jobId },
            data: {
              generationStatus: "failed",
              pollCount,
              errorMessage:
                taskResult.errorMessage ||
                `Generation failed: ${taskResult.status}`,
            },
          });
          const eventData = {
            songId: jobId,
            status: "failed" as const,
            errorMessage: updated.errorMessage,
          };
          broadcast(song.userId, {
            type: "generation_update",
            data: eventData,
          });
          sendEvent(controller, "generation_update", eventData);
          break;
        }

        // Still pending — send progress update
        await prisma.song.update({
          where: { id: jobId },
          data: { pollCount },
        });
        sendEvent(controller, "generation_update", {
          songId: jobId,
          status: "processing",
          pollCount,
        });

        await sleep(POLL_INTERVAL_MS);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
