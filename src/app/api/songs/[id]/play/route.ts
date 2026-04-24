import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { fetchFreshUrls } from "@/lib/sunoapi/refresh";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";

// Audio URLs expire in 15 days for generated songs; refresh when within 3 days of expiry or already expired.
const REFRESH_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
// Conservative expiry to set after a successful refresh (12 days).
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

    const now = Date.now();
    const isExpired =
      !song.audioUrlExpiresAt ||
      song.audioUrlExpiresAt.getTime() - now < REFRESH_THRESHOLD_MS;

    if (isExpired && song.sunoJobId) {
      try {
        const userApiKey = await resolveUserApiKey(userId);
        const fresh = await fetchFreshUrls(song.sunoJobId, userApiKey);
        if (fresh?.audioUrl) {
          await prisma.song.update({
            where: { id },
            data: {
              audioUrl: fresh.audioUrl,
              audioUrlExpiresAt: new Date(now + AUDIO_URL_TTL_MS),
              imageUrl: fresh.imageUrl || song.imageUrl,
              playCount: { increment: 1 },
            },
          });
          return NextResponse.json({ ok: true, audioUrl: fresh.audioUrl });
        }
      } catch {
        // Transient error — allow playback to continue with existing URL (may still work).
      }
    }

    const updated = await prisma.song.updateMany({
      where: { id, userId },
      data: { playCount: { increment: 1 } },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Song not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
