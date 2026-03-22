import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  uploadFileBase64,
  uploadFileFromUrl,
  generateMashup,
  SunoApiError,
} from "@/lib/sunoapi";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { invalidateByPrefix } from "@/lib/cache";

function userFriendlyError(error: unknown): string {
  if (error instanceof SunoApiError) {
    if (error.status === 429)
      return "The music generation service is busy. Please try again in a few minutes.";
    if (error.status === 400)
      return "Invalid mashup parameters. Please check your files and settings.";
    if (error.status === 401 || error.status === 403)
      return "API authentication failed. Please check your API key in settings.";
    if (error.status >= 500)
      return "The music generation service is temporarily unavailable. Please try again later.";
  }
  if (
    error instanceof TypeError &&
    (error.message.includes("fetch") || error.message.includes("network"))
  ) {
    return "Could not reach the music generation service. Please check your connection and try again.";
  }
  return "Mashup generation failed. Please try again.";
}

const MAX_BASE64_SIZE = 10 * 1024 * 1024;

interface TrackSource {
  base64Data?: string;
  fileUrl?: string;
  songId?: string;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(userId);
    if (!acquired) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil(
          (new Date(rateLimitStatus.resetAt).getTime() - Date.now()) / 1000
        )
      );
      return NextResponse.json(
        {
          error: `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`,
          resetAt: rateLimitStatus.resetAt,
          rateLimit: rateLimitStatus,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        }
      );
    }

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
        { error: "Two tracks are required for a mashup" },
        { status: 400 }
      );
    }

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    if (!hasApiKey) {
      return NextResponse.json(
        {
          error:
            "No API key configured. Set your API key in Settings or contact an admin.",
        },
        { status: 400 }
      );
    }

    try {
      // Upload both tracks and get URLs
      const uploadTrack = async (track: TrackSource): Promise<string> => {
        // If the track is from the library (has an audioUrl), use URL upload
        if (track.songId) {
          const song = await prisma.song.findFirst({
            where: { id: track.songId, userId },
            select: { audioUrl: true },
          });
          if (!song?.audioUrl) {
            throw new Error("Selected song has no audio URL");
          }
          const result = await uploadFileFromUrl(song.audioUrl, userApiKey);
          return result.fileUrl;
        }

        if (track.base64Data) {
          const sizeBytes = Math.ceil((track.base64Data.length * 3) / 4);
          if (sizeBytes > MAX_BASE64_SIZE) {
            throw new Error(
              "File too large for upload (max 10MB). Use a URL instead."
            );
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

      // Find parent song IDs for reference
      const parentSongId = trackA.songId || trackB.songId || null;

      const song = await prisma.song.create({
        data: {
          userId,
          sunoJobId: result.taskId,
          title: title?.trim() || "Mashup",
          prompt: prompt?.trim() || "Mashup",
          tags: style?.trim() || null,
          isInstrumental: Boolean(instrumental),
          generationStatus: "pending",
          parentSongId: parentSongId,
        },
      });

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

      const errorMsg = userFriendlyError(apiError);
      const song = await prisma.song.create({
        data: {
          userId,
          title: title?.trim() || "Mashup",
          prompt: prompt?.trim() || "Mashup",
          tags: style?.trim() || null,
          isInstrumental: Boolean(instrumental),
          generationStatus: "failed",
          errorMessage: errorMsg,
        },
      });

      return NextResponse.json(
        { songs: [song], error: errorMsg, rateLimit: rateLimitStatus },
        { status: 201 }
      );
    }
  } catch (error) {
    logServerError("mashup-route", error, { route: "/api/mashup" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
