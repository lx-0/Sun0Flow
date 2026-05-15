import { apiError, ErrorCode, serviceUnavailable } from "@/lib/api-error";
import { SunoApiError } from "@/lib/sunoapi/errors";

type SunoErrorMappingOptions = {
  notFoundMessage?: string;
  notFoundStatus?: number;
  includeRawMessageOnFallback?: boolean;
  fallbackMessage?: string;
};

export type MapSunoApiErrorOptions = SunoErrorMappingOptions;

export function mapSunoApiError(
  error: SunoApiError,
  options: SunoErrorMappingOptions = {},
) {
  if (error.status === 401) {
    return apiError("Invalid Suno API key", ErrorCode.SUNO_AUTH_ERROR, 401);
  }

  if (error.status === 429) {
    return apiError(
      "Suno API rate limit exceeded. Please try again later.",
      ErrorCode.SUNO_RATE_LIMIT,
      429,
    );
  }

  if (error.status === 404 && options.notFoundMessage) {
    return apiError(
      options.notFoundMessage,
      ErrorCode.SUNO_API_ERROR,
      options.notFoundStatus ?? 404,
    );
  }

  if (error.status >= 500) {
    return serviceUnavailable("Suno API is temporarily unavailable. Please try again later.");
  }

  const fallbackMessage = options.fallbackMessage
    ?? "Unable to complete Suno API request. Please check your API key and try again.";

  const message = options.includeRawMessageOnFallback
    && error.message
    && error.message !== "No message available"
    ? error.message
    : fallbackMessage;

  return apiError(message, ErrorCode.SUNO_API_ERROR, 502);
}
