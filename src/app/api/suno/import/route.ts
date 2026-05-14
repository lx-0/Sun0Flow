import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { resolveUserApiKey, getSongById, SunoApiError } from "@/lib/sunoapi";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { apiError, internalError, ErrorCode } from "@/lib/api-error";
import { mapSunoApiError } from "@/lib/suno-api-error";

const MAX_BATCH_SIZE = 20;

const importSongsBodySchema = z.object({
  songIds: z.array(z.string()).min(1, "songIds must not be empty").max(MAX_BATCH_SIZE, `Batch size exceeds limit of ${MAX_BATCH_SIZE}`),
});

export const POST = authRoute(async (_request, { auth, body }) => {
  try {
    const apiKey = await resolveUserApiKey(auth.userId);
    if (!apiKey) {
      return apiError("No Suno API key configured", ErrorCode.VALIDATION_ERROR, 400);
    }

    const existing = await prisma.song.findMany({
      where: { userId: auth.userId, sunoJobId: { in: body.songIds } },
      select: { sunoJobId: true, id: true },
    });
    const existingMap = new Map(existing.map((s) => [s.sunoJobId!, s.id]));

    const imported: Array<{ sunoId: string; localId: string }> = [];
    const skipped: Array<{ sunoId: string; reason: string }> = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const songId of body.songIds) {
      if (existingMap.has(songId)) {
        skipped.push({ sunoId: songId, reason: "already imported" });
        continue;
      }

      try {
        const song = await getSongById(songId, apiKey);
        const created = await prisma.song.create({
          data: {
            userId: auth.userId,
            sunoJobId: song.id,
            title: song.title ?? null,
            audioUrl: song.audioUrl ?? null,
            imageUrl: song.imageUrl ?? null,
            duration: song.duration ?? null,
            tags: song.tags ?? null,
            lyrics: song.lyrics ?? null,
            prompt: song.prompt ?? null,
            sunoModel: song.model ?? null,
            source: "import",
            generationStatus: "ready",
          },
          select: { id: true },
        });
        imported.push({ sunoId: songId, localId: created.id });
      } catch (err) {
        if (err instanceof SunoApiError) {
          errors.push({ id: songId, error: err.message });
        } else if (err instanceof Error) {
          errors.push({ id: songId, error: err.message });
        } else {
          errors.push({ id: songId, error: "Unknown error" });
        }
      }
    }

    return NextResponse.json({ imported, skipped, errors });
  } catch (error) {
    if (error instanceof SunoApiError) {
      return mapSunoApiError(error, {
        includeRawMessageOnFallback: true,
      });
    }
    logServerError("suno-import", error, { route: "/api/suno/import" });
    return internalError();
  }
}, { body: importSongsBodySchema, route: "/api/suno/import" });
