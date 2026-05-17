import { NextResponse } from "next/server";
import {
  resolveUserApiKey,
} from "@/lib/sunoapi";
import { executeGeneration, respondToGeneration } from "@/lib/generation";
import { authRoute } from "@/lib/route-handler";
import { logServerError } from "@/lib/error-logger";
import {
  buildUploadGenerationInput,
  uploadBodySchema,
  validateUploadBody,
  type UploadBody,
} from "@/lib/upload/request";
import { runUploadGenerationApiCall } from "@/lib/upload/api-call";

export const POST = authRoute<Record<string, never>, UploadBody>(async (
  _request,
  { auth, body },
) => {
  try {
    const validationError = validateUploadBody(body);
    if (validationError) {
      return NextResponse.json(validationError, { status: 400 });
    }

    const { mode, base64Data, fileUrl } = body;

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
      songParams: buildUploadGenerationInput(body),
      hasApiKey: true,
      mockFallback: {},
      guards: "free",
      description: `Upload ${mode}: ${body.title?.trim() || "Untitled"}`,
      apiCall: async () => runUploadGenerationApiCall(body, userApiKey),
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
}, { route: "/api/upload", body: uploadBodySchema });
