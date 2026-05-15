import { z } from "zod";
import { NextResponse } from "next/server";
import { ErrorCode, apiError, serviceUnavailable } from "@/lib/api-error";
import { authRoute } from "@/lib/route-handler";
import { boostStyle, SunoApiError, resolveUserApiKey } from "@/lib/sunoapi";
import { logServerError } from "@/lib/error-logger";
import { mapSunoApiError } from "@/lib/suno-api-error";

const bodySchema = z.object({
  content: z.string()
    .trim()
    .min(1, "A style description is required")
    .max(500, "Style description must be 500 characters or less"),
});

export const POST = authRoute(async (_request, { auth, body }) => {
  try {
    const userApiKey = await resolveUserApiKey(auth.userId);
    const result = await boostStyle(body.content, userApiKey);

    return NextResponse.json({
      result: result.result,
      creditsConsumed: result.creditsConsumed,
      creditsRemaining: result.creditsRemaining,
    });
  } catch (error) {
    if (error instanceof SunoApiError) {
      logServerError("style-boost-api", error, { route: "/api/style-boost", userId: auth.userId });
      const response = mapSunoApiError(error, {
        fallbackMessage: "Style boost failed. Please try again.",
      });
      if (response.status === 503) {
        return serviceUnavailable("Style boost failed. Please try again.");
      }
      if (response.status !== 401 && response.status !== 429) {
        return apiError("Style boost failed. Please try again.", ErrorCode.SUNO_API_ERROR, error.status);
      }
      return response;
    }
    throw error;
  }
}, {
  route: "/api/style-boost",
  body: bodySchema,
});
