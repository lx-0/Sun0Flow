import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { getTaskStatus, SunoApiError, resolveUserApiKey } from "@/lib/sunoapi";
import { audioCache, imageCache } from "@/lib/cache";

const CDN_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

export const POST = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { data: song, error } = requireOwned(
      await prisma.song.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Song",
    );
    if (error) return error;

    if (!song.sunoJobId) {
      return NextResponse.json(
        { error: "Song has no Suno ID to refresh from.", code: "NO_SUNO_ID" },
        { status: 422 },
      );
    }

    const userApiKey = await resolveUserApiKey(auth.userId);
    let taskResult;
    try {
      taskResult = await getTaskStatus(song.sunoJobId, userApiKey);
    } catch (err) {
      if (err instanceof SunoApiError) {
        if (err.status === 404) {
          return NextResponse.json(
            { error: "This song no longer exists on Suno.", code: "SONG_DELETED" },
            { status: 404 },
          );
        }
        if (err.status === 401) {
          return NextResponse.json(
            { error: "Invalid or missing Suno API key.", code: "UNAUTHORIZED" },
            { status: 401 },
          );
        }
      }
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json(
        { error: `Failed to refresh song from Suno API: ${msg}`, code: "REFRESH_FAILED" },
        { status: 502 },
      );
    }

    const fresh = taskResult.songs.find((s) => s.audioUrl) ?? taskResult.songs[0];
    if (!fresh) {
      return NextResponse.json(
        { error: "No audio data returned from Suno.", code: "NO_AUDIO" },
        { status: 404 },
      );
    }

    const expiresAt = new Date(Date.now() + CDN_URL_TTL_MS);
    const updated = await prisma.song.update({
      where: { id: params.id },
      data: {
        audioUrl: fresh.audioUrl || song.audioUrl,
        audioUrlExpiresAt: fresh.audioUrl ? expiresAt : song.audioUrlExpiresAt,
        ...(!song.imageUrlIsCustom && {
          imageUrl: fresh.imageUrl || song.imageUrl,
          imageUrlExpiresAt: fresh.imageUrl ? expiresAt : song.imageUrlExpiresAt,
        }),
      },
    });

    if (updated.audioUrl) {
      audioCache.downloadAndPut(params.id, updated.audioUrl).catch(() => {});
    }
    if (updated.imageUrl && !imageCache.has(params.id)) {
      imageCache.downloadAndPut(params.id, updated.imageUrl).catch(() => {});
    }

    return NextResponse.json({ ok: true, song: updated });
  },
  { route: "/api/songs/[id]/refresh" },
);
