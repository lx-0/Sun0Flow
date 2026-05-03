import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import {
  uploadFileBase64,
  uploadFileFromUrl,
  generateMashup,
} from "@/lib/sunoapi";
import { getTaskStatus } from "@/lib/sunoapi/status";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { invalidateByPrefix } from "@/lib/cache";
import { canUseFeature, SubscriptionTier } from "@/lib/feature-gates";
import {
  userFriendlyError,
  enforceRateLimit,
  createSongRecord,
} from "@/lib/generation";

const EXPIRY_BUFFER_MS = 60 * 60 * 1000;

const MAX_BASE64_SIZE = 10 * 1024 * 1024;

interface TrackSource {
  base64Data?: string;
  fileUrl?: string;
  songId?: string;
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true },
    });
    const tier: SubscriptionTier = (subscription?.tier as SubscriptionTier) ?? "free";
    if (!canUseFeature("mashupStudio", tier)) {
      return NextResponse.json(
        { error: "Mashup Studio requires Starter tier or higher", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const rateLimitResult = await enforceRateLimit(userId);
    if (rateLimitResult.limited) return rateLimitResult.response;
    const rateLimitStatus = rateLimitResult.status;

    const body = await request.json();
    const {
      trackA,
      trackB,
      title,
      prompt,
      style,
      instrumental,
    } = body as {
      trackA: TrackSource;
      trackB: TrackSource;
      title?: string;
      prompt?: string;
      style?: string;
      instrumental?: boolean;
    };

    if (!trackA || !trackB) {
      return NextResponse.json(
        { error: "Two tracks are required for a mashup", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    if (!hasApiKey) {
      return NextResponse.json(
        {
          error: "No API key configured. Set your API key in Settings or contact an admin.",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    const songParams = {
      title: title?.trim() || "Mashup",
      prompt: prompt?.trim() || "Mashup",
      tags: style?.trim() || null,
      isInstrumental: Boolean(instrumental),
      parentSongId: trackA.songId || trackB.songId || null,
    };

    try {
      const uploadTrack = async (track: TrackSource): Promise<string> => {
        if (track.songId) {
          const song = await prisma.song.findFirst({
            where: { id: track.songId, userId },
            select: { audioUrl: true, audioUrlExpiresAt: true, sunoJobId: true },
          });
          if (!song?.audioUrl) {
            throw new Error("Selected song has no audio URL");
          }

          let audioUrl = song.audioUrl;
          const isExpiredOrSoon =
            !song.audioUrlExpiresAt ||
            song.audioUrlExpiresAt.getTime() - Date.now() < EXPIRY_BUFFER_MS;
          if (isExpiredOrSoon && song.sunoJobId) {
            try {
              const taskResult = await getTaskStatus(song.sunoJobId, userApiKey);
              const fresh = taskResult.songs.find((s) => s.audioUrl) ?? taskResult.songs[0];
              if (fresh?.audioUrl) {
                audioUrl = fresh.audioUrl;
                prisma.song.update({
                  where: { id: track.songId },
                  data: {
                    audioUrl: fresh.audioUrl,
                    audioUrlExpiresAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
                  },
                }).catch(() => {});
              }
            } catch {
              // Refresh failed — try with existing URL
            }
          }

          const result = await uploadFileFromUrl(audioUrl, userApiKey);
          return result.fileUrl;
        }

        if (track.base64Data) {
          const sizeBytes = Math.ceil((track.base64Data.length * 3) / 4);
          if (sizeBytes > MAX_BASE64_SIZE) {
            throw new Error("File too large for upload (max 10MB). Use a URL instead.");
          }
          const result = await uploadFileBase64(track.base64Data, userApiKey);
          return result.fileUrl;
        }

        if (track.fileUrl) {
          const result = await uploadFileFromUrl(track.fileUrl, userApiKey);
          return result.fileUrl;
        }

        throw new Error("Track must have a file, URL, or library song");
      };

      const [urlA, urlB] = await Promise.all([
        uploadTrack(trackA),
        uploadTrack(trackB),
      ]);

      const result = await generateMashup(
        {
          uploadUrlList: [urlA, urlB],
          customMode: !!(prompt || style),
          instrumental: instrumental != null ? Boolean(instrumental) : undefined,
          prompt: prompt?.trim() || undefined,
          style: style?.trim() || undefined,
          title: title?.trim() || undefined,
        },
        userApiKey
      );

      const song = await createSongRecord(userId, songParams, { status: "pending", sunoJobId: result.taskId });

      invalidateByPrefix(`dashboard-stats:${userId}`);

      return NextResponse.json(
        { songs: [song], rateLimit: rateLimitStatus },
        { status: 201 }
      );
    } catch (apiError) {
      logServerError("mashup-api", apiError, {
        userId,
        route: "/api/mashup",
      });

      const { message: errorMsg } = userFriendlyError(apiError);
      const song = await createSongRecord(userId, songParams, { status: "failed", errorMessage: errorMsg });

      return NextResponse.json(
        { songs: [song], error: errorMsg, rateLimit: rateLimitStatus },
        { status: 201 }
      );
    }
  } catch (error) {
    logServerError("mashup-route", error, { route: "/api/mashup" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
