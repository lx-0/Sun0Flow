import { describe, expect, it } from "vitest";
import { mapSunoApiError } from "@/lib/suno-api-error";
import { SunoApiError } from "@/lib/sunoapi/errors";

async function jsonBody(response: Response) {
  return response.json() as Promise<{ error: string; code: string }>;
}

describe("mapSunoApiError", () => {
  it("maps 401 to SUNO_AUTH_ERROR", async () => {
    const response = mapSunoApiError(new SunoApiError(401, "Unauthorized"));
    expect(response.status).toBe(401);
    await expect(jsonBody(response)).resolves.toEqual({
      error: "Invalid Suno API key",
      code: "SUNO_AUTH_ERROR",
    });
  });

  it("maps 429 to SUNO_RATE_LIMIT", async () => {
    const response = mapSunoApiError(new SunoApiError(429, "Rate limited"));
    expect(response.status).toBe(429);
    await expect(jsonBody(response)).resolves.toEqual({
      error: "Suno API rate limit exceeded. Please try again later.",
      code: "SUNO_RATE_LIMIT",
    });
  });

  it("maps 404 with endpoint-specific message when provided", async () => {
    const response = mapSunoApiError(new SunoApiError(404, "Not found"), {
      notFoundMessage: "Listing unavailable",
      notFoundStatus: 501,
    });
    expect(response.status).toBe(501);
    await expect(jsonBody(response)).resolves.toEqual({
      error: "Listing unavailable",
      code: "SUNO_API_ERROR",
    });
  });

  it("maps 5xx to SERVICE_UNAVAILABLE", async () => {
    const response = mapSunoApiError(new SunoApiError(503, "Upstream unavailable"));
    expect(response.status).toBe(503);
    await expect(jsonBody(response)).resolves.toEqual({
      error: "Suno API is temporarily unavailable. Please try again later.",
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("uses raw message for non-special errors when enabled", async () => {
    const response = mapSunoApiError(new SunoApiError(418, "Teapot"), {
      includeRawMessageOnFallback: true,
      fallbackMessage: "Fallback",
    });
    expect(response.status).toBe(502);
    await expect(jsonBody(response)).resolves.toEqual({
      error: "Teapot",
      code: "SUNO_API_ERROR",
    });
  });
});
