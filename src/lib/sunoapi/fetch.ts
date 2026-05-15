import { SUNO_API_TIMEOUT_MS, SUNOAPI_KEY } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  CircuitOpenError,
  requestPermission,
  recordSuccess,
  recordFailure,
} from "@/lib/circuit-breaker";
import { SunoApiError } from "./errors";
import type { SunoApiErrorCode } from "./errors";

function getTimeoutMs(): number {
  return SUNO_API_TIMEOUT_MS;
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 1
): Promise<Response> {
  const permission = requestPermission();
  if (permission === "blocked") {
    throw new CircuitOpenError();
  }

  const timeoutMs = getTimeoutMs();
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        recordFailure();
        throw new SunoApiError(
          0,
          `Suno API request timed out after ${timeoutMs / 1000}s`,
          "TIMEOUT"
        );
      }
      recordFailure();
      throw err;
    }
    clearTimeout(timeoutId);

    if (res.ok) {
      recordSuccess();
      return res;
    }

    if (!isRetryable(res.status) || attempt >= maxRetries) {
      let message: string;
      let rawBody: string | undefined;
      let parsedBody: Record<string, unknown> | undefined;
      try {
        rawBody = await res.text();
        parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
        message = (parsedBody.msg as string) ?? (parsedBody.message as string) ?? (parsedBody.error as string) ?? res.statusText;
      } catch {
        message = rawBody || res.statusText;
      }
      const logFn = res.status === 429 ? logger.warn.bind(logger) : logger.error.bind(logger);
      logFn({ url, status: res.status, statusText: res.statusText, body: rawBody, attempt }, "suno-api: request failed");
      if (res.status >= 500 || res.status === 0) {
        recordFailure();
      }

      let errorCode: SunoApiErrorCode = "UNKNOWN";
      let errorDetails: Record<string, unknown> | undefined;
      switch (res.status) {
        case 402:
          errorCode = "INSUFFICIENT_CREDITS";
          break;
        case 409:
          errorCode = "CONFLICT";
          break;
        case 422:
          errorCode = "VALIDATION_ERROR";
          if (parsedBody) errorDetails = { validation: parsedBody };
          break;
        case 451:
          errorCode = "COMPLIANCE_BLOCK";
          break;
        case 429:
          errorCode = "RATE_LIMITED";
          break;
        case 401:
        case 403:
          errorCode = "AUTH_ERROR";
          break;
        default:
          if (res.status >= 500) errorCode = "SERVER_ERROR";
      }

      throw new SunoApiError(res.status, message, errorCode, errorDetails);
    }

    let delay: number;
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "", 10);
      delay = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000) * Math.pow(2, attempt);
    } else {
      delay = 200 * Math.pow(2, attempt);
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt++;
  }
}

export function buildHeaders(apiKey?: string): HeadersInit {
  const key = apiKey || SUNOAPI_KEY;
  if (!key) {
    throw new SunoApiError(0, "SUNOAPI_KEY environment variable is not set");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}
