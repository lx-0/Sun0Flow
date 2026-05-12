import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateMashup,
  resolveUserApiKey,
  uploadFileBase64,
  uploadFileFromUrl,
  getTaskStatus,
} from "@/lib/sunoapi";
import { canUseFeature, type SubscriptionTier } from "@/lib/feature-gates";
import { executeGeneration, type GenerationOutcome } from "@/lib/generation";

const EXPIRY_BUFFER_MS = 60 * 60 * 1000;
const MAX_BASE64_SIZE = 10 * 1024 * 1024;

export interface TrackSource {
  base64Data?: string;
  fileUrl?: string;
  songId?: string;
}

export interface MashupSpec {
  userId: string;
  trackA: TrackSource;
  trackB: TrackSource;
  title?: string;
  prompt?: string;
  style?: string;
  instrumental?: boolean;
}

export type MashupOutcome = GenerationOutcome;

export async function executeMashup(spec: MashupSpec): Promise<MashupOutcome> {
  const { userId, trackA, trackB, title, prompt, style, instrumental } = spec;

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { tier: true },
  });
  const tier: SubscriptionTier =
    (subscription?.tier as SubscriptionTier) ?? "free";

  if (!canUseFeature("mashupStudio", tier)) {
    return {
      status: "denied",
      response: NextResponse.json(
        {
          error: "Mashup Studio requires Starter tier or higher",
          code: "FORBIDDEN",
        },
        { status: 403 },
      ),
    };
  }

  const userApiKey = await resolveUserApiKey(userId);
  const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

  if (!hasApiKey) {
    return {
      status: "denied",
      response: NextResponse.json(
        {
          error:
            "No API key configured. Set your API key in Settings or contact an admin.",
          code: "VALIDATION_ERROR",
        },
        { status: 400 },
      ),
    };
  }

  return executeGeneration({
    userId,
    action: "mashup",
    songParams: {
      title: title?.trim() || "Mashup",
      prompt: prompt?.trim() || "Mashup",
      tags: style?.trim() || null,
      isInstrumental: Boolean(instrumental),
      parentSongId: trackA.songId || trackB.songId || null,
    },
    hasApiKey: true,
    mockFallback: {},
    guards: "free",
    description: `Mashup generation: ${title?.trim() || "Mashup"}`,
    apiCall: async () => {
      const [urlA, urlB] = await Promise.all([
        resolveTrackUrl(trackA, userId, userApiKey),
        resolveTrackUrl(trackB, userId, userApiKey),
      ]);
      return generateMashup(
        {
          uploadUrlList: [urlA, urlB],
          customMode: !!(prompt || style),
          instrumental:
            instrumental != null ? Boolean(instrumental) : undefined,
          prompt: prompt?.trim() || undefined,
          style: style?.trim() || undefined,
          title: title?.trim() || undefined,
        },
        userApiKey,
      );
    },
  });
}

async function resolveTrackUrl(
  track: TrackSource,
  userId: string,
  apiKey: string | undefined,
): Promise<string> {
  if (track.songId) {
    return resolveFromLibrary(track.songId, userId, apiKey);
  }

  if (track.base64Data) {
    return resolveFromBase64(track.base64Data, apiKey);
  }

  if (track.fileUrl) {
    const result = await uploadFileFromUrl(track.fileUrl, apiKey);
    return result.fileUrl;
  }

  throw new Error("Track must have a file, URL, or library song");
}

async function resolveFromLibrary(
  songId: string,
  userId: string,
  apiKey: string | undefined,
): Promise<string> {
  const song = await prisma.song.findFirst({
    where: { id: songId, userId },
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
      const taskResult = await getTaskStatus(song.sunoJobId, apiKey);
      const fresh =
        taskResult.songs.find((s) => s.audioUrl) ?? taskResult.songs[0];
      if (fresh?.audioUrl) {
        audioUrl = fresh.audioUrl;
        prisma.song
          .update({
            where: { id: songId },
            data: {
              audioUrl: fresh.audioUrl,
              audioUrlExpiresAt: new Date(
                Date.now() + 12 * 24 * 60 * 60 * 1000,
              ),
            },
          })
          .catch(() => {});
      }
    } catch {
      // Refresh failed — try with existing URL
    }
  }

  const result = await uploadFileFromUrl(audioUrl, apiKey);
  return result.fileUrl;
}

async function resolveFromBase64(
  base64Data: string,
  apiKey: string | undefined,
): Promise<string> {
  const sizeBytes = Math.ceil((base64Data.length * 3) / 4);
  if (sizeBytes > MAX_BASE64_SIZE) {
    throw new Error("File too large for upload (max 10MB). Use a URL instead.");
  }
  const result = await uploadFileBase64(base64Data, apiKey);
  return result.fileUrl;
}
