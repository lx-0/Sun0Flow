import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import {
  uploadFileBase64,
  uploadFileFromUrl,
  uploadAndCover,
  uploadAndExtend,
} from "@/lib/sunoapi";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { invalidateByPrefix } from "@/lib/cache";
import { userFriendlyError } from "@/lib/generation";

const MAX_BASE64_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    // Check rate limit
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
          error: `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`, code: "RATE_LIMIT",
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
      mode, // "cover" | "extend"
      // Upload source — exactly one required
      base64Data, // base64-encoded file (<=10MB)
      fileUrl, // remote URL (<=100MB)
      // Generation params
      title,
      prompt,
      style,
      instrumental,
      continueAt, // extend only — seconds
    } = body;

    if (mode !== "cover" && mode !== "extend") {
      return NextResponse.json(
        { error: 'Mode must be "cover" or "extend"', code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!base64Data && !fileUrl) {
      return NextResponse.json(
        {
          error:
            "Either a base64-encoded file or a file URL is required", code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    if (base64Data && fileUrl) {
      return NextResponse.json(
        { error: "Provide either base64Data or fileUrl, not both", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Validate base64 size
    if (base64Data) {
      const sizeBytes = Math.ceil((base64Data.length * 3) / 4);
      if (sizeBytes > MAX_BASE64_SIZE) {
        return NextResponse.json(
          {
            error:
              "File too large for base64 upload (max 10MB). Use a URL-based upload for larger files.",
          },
          { status: 400 }
        );
      }
    }

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    if (!hasApiKey) {
      return NextResponse.json(
        {
          error:
            "No API key configured. Set your API key in Settings or contact an admin.", code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    try {
      // Step 1: Upload the file to get an uploadUrl
      const uploadResult = base64Data
        ? await uploadFileBase64(base64Data, userApiKey)
        : await uploadFileFromUrl(fileUrl, userApiKey);

      const uploadUrl = uploadResult.fileUrl;

      // Step 2: Trigger cover or extend generation
      let result: { taskId: string };

      if (mode === "cover") {
        result = await uploadAndCover(
          {
            uploadUrl,
            customMode: !!(prompt || style),
            instrumental: Boolean(instrumental),
            prompt: prompt?.trim() || undefined,
            style: style?.trim() || undefined,
            title: title?.trim() || undefined,
          },
          userApiKey
        );
      } else {
        result = await uploadAndExtend(
          {
            uploadUrl,
            instrumental:
              instrumental != null ? Boolean(instrumental) : undefined,
            prompt: prompt?.trim() || undefined,
            style: style?.trim() || undefined,
            title: title?.trim() || undefined,
            continueAt:
              continueAt != null ? Number(continueAt) : undefined,
          },
          userApiKey
        );
      }

      // Step 3: Create Song record
      const song = await prisma.song.create({
        data: {
          userId,
          sunoJobId: result.taskId,
          title: title?.trim() || null,
          prompt: prompt?.trim() || `Upload ${mode}`,
          tags: style?.trim() || null,
          isInstrumental: Boolean(instrumental),
          generationStatus: "pending",
        },
      });

      invalidateByPrefix(`dashboard-stats:${userId}`);

      return NextResponse.json(
        { songs: [song], rateLimit: rateLimitStatus },
        { status: 201 }
      );
    } catch (apiError) {
      logServerError("upload-api", apiError, {
        userId,
        route: "/api/upload",
        params: { mode, hasBase64: !!base64Data, hasUrl: !!fileUrl },
      });

      const errorMsg = userFriendlyError(apiError, "Upload and generation failed. Please try again.").message;
      const song = await prisma.song.create({
        data: {
          userId,
          title: title?.trim() || null,
          prompt: prompt?.trim() || `Upload ${mode}`,
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
    logServerError("upload-route", error, { route: "/api/upload" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
