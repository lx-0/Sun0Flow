import { apiError, ErrorCode, internalError } from "@/lib/api-error";
import { logServerError } from "@/lib/error-logger";
import { mapSunoApiError, type MapSunoApiErrorOptions } from "@/lib/suno-api-error";
import { resolveUserApiKey, SunoApiError } from "@/lib/sunoapi";

export async function resolveRequiredSunoApiKey(userId: string): Promise<string | Response> {
  const apiKey = await resolveUserApiKey(userId);
  if (!apiKey) {
    return apiError("No Suno API key configured", ErrorCode.VALIDATION_ERROR, 400);
  }
  return apiKey;
}

export function handleSunoRouteError(
  error: unknown,
  config: {
    logLabel: string;
    route: string;
    mapOptions?: MapSunoApiErrorOptions;
    fallbackResponse?: Response;
  }
): Response {
  if (error instanceof SunoApiError) {
    return mapSunoApiError(error, config.mapOptions);
  }
  logServerError(config.logLabel, error, { route: config.route });
  return config.fallbackResponse ?? internalError();
}
