import { SunoApiError } from "@/lib/sunoapi";
import { ErrorCode } from "@/lib/api-error";

export interface GenerationError {
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

export function userFriendlyError(error: unknown): GenerationError {
  if (error instanceof SunoApiError) {
    if (error.status === 402)
      return { message: "Insufficient credits. Please check your balance or top up to continue.", code: ErrorCode.INSUFFICIENT_CREDITS };
    if (error.status === 409)
      return { message: "A conflicting request is already in progress. Please wait and try again.", code: ErrorCode.CONFLICT };
    if (error.status === 422)
      return { message: `Validation error: ${error.message}`, code: ErrorCode.VALIDATION_ERROR, details: error.details };
    if (error.status === 429)
      return { message: "The music generation service is busy. Please try again in a few minutes.", code: ErrorCode.SUNO_RATE_LIMIT };
    if (error.status === 451)
      return { message: "This request was blocked for compliance reasons. Please modify your prompt and try again.", code: ErrorCode.COMPLIANCE_BLOCK };
    if (error.status === 400)
      return { message: "Invalid generation parameters. Please adjust your prompt and try again.", code: ErrorCode.VALIDATION_ERROR };
    if (error.status === 401 || error.status === 403)
      return { message: "API authentication failed. Please check your API key in settings.", code: ErrorCode.SUNO_AUTH_ERROR };
    if (error.status >= 500)
      return { message: "The music generation service is temporarily unavailable — please try again in a moment.", code: ErrorCode.SERVICE_UNAVAILABLE };
    return { message: `Generation failed: ${error.message}`, code: ErrorCode.SUNO_API_ERROR };
  }
  if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("network"))) {
    return { message: "Could not reach the music generation service. Please check your connection and try again.", code: ErrorCode.SERVICE_UNAVAILABLE };
  }
  return { message: "Song generation failed. Please try again.", code: ErrorCode.INTERNAL_ERROR };
}
