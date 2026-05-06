import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { getSongById } from "@/lib/sunoapi/songs";
import { SunoApiError } from "@/lib/sunoapi/errors";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { apiError, internalError, ErrorCode } from "@/lib/api-error";

const MAX_BATCH_SIZE = 20;

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const apiKey = await resolveUserApiKey(userId!);
    if (!apiKey) {
      return apiError("No Suno API key configured", ErrorCode.VALIDATION_ERROR, 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body", ErrorCode.VALIDATION_ERROR, 400);
    }

    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray((body as Record<string, unknown>).songIds)
    ) {
      return apiError("Request body must include a songIds array", ErrorCode.VALIDATION_ERROR, 400);
    }

    const { songIds } = body as { songIds: string[] };

    if (songIds.length === 0) {
      return apiError("songIds must not be empty", ErrorCode.VALIDATION_ERROR, 400);
    }

    if (songIds.length > MAX_BATCH_SIZE) {
      return apiError(
        `Batch size exceeds limit of ${MAX_BATCH_SIZE}`,
        ErrorCode.VALIDATION_ERROR,
        400
      );
    }

    // Find which songs are already imported for this user
    const existing = await prisma.song.findMany({
      where: { userId: userId!, sunoJobId: { in: songIds } },
      select: { sunoJobId: true, id: true },
    });
    const existingMap = new Map(existing.map((s) => [s.sunoJobId!, s.id]));

    const imported: Array<{ sunoId: string; localId: string }> = [];
    const skipped: Array<{ sunoId: string; reason: string }> = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const songId of songIds) {
      if (existingMap.has(songId)) {
        skipped.push({ sunoId: songId, reason: "already imported" });
        continue;
      }

      try {
        const song = await getSongById(songId, apiKey);
        const created = await prisma.song.create({
          data: {
            userId: userId!,
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
      if (error.status === 401) {
        return apiError("Invalid Suno API key", ErrorCode.SUNO_AUTH_ERROR, 401);
      }
      if (error.status === 429) {
        return apiError(
          "Suno API rate limit exceeded. Please try again later.",
          ErrorCode.SUNO_RATE_LIMIT,
          429
        );
      }
      return apiError(error.message, ErrorCode.SUNO_API_ERROR, 502);
    }
    logServerError("suno-import", error, { route: "/api/suno/import" });
    return internalError();
  }
}
