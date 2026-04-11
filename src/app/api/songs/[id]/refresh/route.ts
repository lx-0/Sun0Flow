import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { getTaskStatus } from "@/lib/sunoapi/status";
import { SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { downloadAndCache } from "@/lib/audio-cache";

// Conservative expiry after a successful refresh (12 days).
const AUDIO_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id } = await params;

    const song = await prisma.song.findUnique({ where: { id } });
    if (!song || song.userId !== userId) {
      return NextResponse.json({ error: "Song not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (!song.sunoJobId) {
      return NextResponse.json(
        { error: "Song has no Suno ID to refresh from.", code: "NO_SUNO_ID" },
        { status: 422 }
      );
    }

    const userApiKey = await resolveUserApiKey(userId);
    let taskResult;
    try {
      taskResult = await getTaskStatus(song.sunoJobId, userApiKey);
    } catch (err) {
      if (err instanceof SunoApiError) {
        if (err.status === 404) {
          return NextResponse.json(
            { error: "This song no longer exists on Suno.", code: "SONG_DELETED" },
            { status: 404 }
          );
        }
        if (err.status === 401) {
          return NextResponse.json(
            { error: "Invalid or missing Suno API key.", code: "UNAUTHORIZED" },
            { status: 401 }
          );
        }
      }
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json(
        { error: `Failed to refresh song from Suno API: ${msg}`, code: "REFRESH_FAILED" },
        { status: 502 }
      );
    }

    // Find the matching clip in the task results
    const fresh = taskResult.songs.find((s) => s.audioUrl) ?? taskResult.songs[0];
    if (!fresh) {
      return NextResponse.json(
        { error: "No audio data returned from Suno.", code: "NO_AUDIO" },
        { status: 404 }
      );
    }

    const updated = await prisma.song.update({
      where: { id },
      data: {
        audioUrl: fresh.audioUrl || song.audioUrl,
        audioUrlExpiresAt: fresh.audioUrl ? new Date(Date.now() + AUDIO_URL_TTL_MS) : song.audioUrlExpiresAt,
        imageUrl: fresh.imageUrl || song.imageUrl,
      },
    });

    // Cache audio locally so playback never depends on Suno URL availability
    if (updated.audioUrl) {
      downloadAndCache(id, updated.audioUrl).catch(() => {});
    }

    return NextResponse.json({ ok: true, song: updated });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
