import { NextResponse } from "next/server";
import {
  uploadFileBase64,
  uploadFileFromUrl,
  uploadAndCover,
  uploadAndExtend,
  resolveUserApiKey,
} from "@/lib/sunoapi";
import { executeGeneration, respondToGeneration } from "@/lib/generation";
import { authRoute } from "@/lib/route-handler";
import { logServerError } from "@/lib/error-logger";

const MAX_BASE64_SIZE = 10 * 1024 * 1024; // 10MB

const postHandler = authRoute(async (request, { auth }) => {
  try {
    const body = await request.json();
    const { mode, base64Data, fileUrl, title, prompt, style, instrumental, continueAt } = body;

    if (mode !== "cover" && mode !== "extend") {
      return NextResponse.json(
        { error: 'Mode must be "cover" or "extend"', code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!base64Data && !fileUrl) {
      return NextResponse.json(
        { error: "Either a base64-encoded file or a file URL is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (base64Data && fileUrl) {
      return NextResponse.json(
        { error: "Provide either base64Data or fileUrl, not both", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (base64Data) {
      const sizeBytes = Math.ceil((base64Data.length * 3) / 4);
      if (sizeBytes > MAX_BASE64_SIZE) {
        return NextResponse.json(
          { error: "File too large for base64 upload (max 10MB). Use a URL-based upload for larger files." },
          { status: 400 }
        );
      }
    }

    const userApiKey = await resolveUserApiKey(auth.userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    if (!hasApiKey) {
      return NextResponse.json(
        { error: "No API key configured. Set your API key in Settings or contact an admin.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const outcome = await executeGeneration({
      userId: auth.userId,
      action: "generate",
      songParams: {
        title: title?.trim() || null,
        prompt: prompt?.trim() || `Upload ${mode}`,
        tags: style?.trim() || null,
        isInstrumental: Boolean(instrumental),
      },
      hasApiKey: true,
      mockFallback: {},
      guards: "free",
      description: `Upload ${mode}: ${title?.trim() || "Untitled"}`,
      apiCall: async () => {
        const uploadResult = base64Data
          ? await uploadFileBase64(base64Data, userApiKey)
          : await uploadFileFromUrl(fileUrl, userApiKey);

        const uploadUrl = uploadResult.fileUrl;

        if (mode === "cover") {
          return uploadAndCover(
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
        }

        return uploadAndExtend(
          {
            uploadUrl,
            instrumental: instrumental != null ? Boolean(instrumental) : undefined,
            prompt: prompt?.trim() || undefined,
            style: style?.trim() || undefined,
            title: title?.trim() || undefined,
            continueAt: continueAt != null ? Number(continueAt) : undefined,
          },
          userApiKey
        );
      },
    });

    return respondToGeneration(
      outcome,
      {
        label: "upload-api",
        userId: auth.userId,
        route: "/api/upload",
        params: { mode, hasBase64: !!base64Data, hasUrl: !!fileUrl },
      },
      { arrayFormat: true },
    );
  } catch (error) {
    logServerError("upload-route", error, { route: "/api/upload" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}, { route: "/api/upload" });

export async function POST(request: Request) {
  return postHandler(request as never, { params: Promise.resolve({}) });
}
