import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { notFound } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { fetchFreshUrls, resolveUserApiKey } from "@/lib/sunoapi";
const AUDIO_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

export const POST = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const { data: song, error } = requireOwned(
    await prisma.song.findUnique({ where: { id: params.id } }),
    auth.userId,
    "Song",
  );
  if (error) return error;

  if (song.sunoJobId) {
    try {
      const userApiKey = await resolveUserApiKey(auth.userId);
      const fresh = await fetchFreshUrls(song.sunoJobId, userApiKey, song.sunoAudioId ?? undefined);
      if (fresh?.audioUrl) {
        await prisma.song.update({
          where: { id: params.id },
          data: {
            audioUrl: fresh.audioUrl,
            audioUrlExpiresAt: new Date(Date.now() + AUDIO_URL_TTL_MS),
            ...(!song.imageUrlIsCustom && {
              imageUrl: fresh.imageUrl || song.imageUrl,
            }),
            playCount: { increment: 1 },
          },
        });
        return NextResponse.json({ ok: true, audioUrl: fresh.audioUrl });
      }
    } catch {
      // Transient error — allow playback to continue with existing URL.
    }
  }

  const updated = await prisma.song.updateMany({
    where: { id: params.id, userId: auth.userId },
    data: { playCount: { increment: 1 } },
  });

  if (updated.count === 0) {
    return notFound("Song not found");
  }

  return NextResponse.json({ ok: true });
}, { route: "/api/songs/[id]/play" });
