import { describe, it, expect } from "vitest";
import {
  apiError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  rateLimited,
  internalError,
  serviceUnavailable,
  ErrorCode,
} from "./api-error";

describe("ErrorCode", () => {
  it("has all expected codes", () => {
    expect(ErrorCode.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(ErrorCode.UNAUTHORIZED).toBe("UNAUTHORIZED");
    expect(ErrorCode.FORBIDDEN).toBe("FORBIDDEN");
    expect(ErrorCode.NOT_FOUND).toBe("NOT_FOUND");
    expect(ErrorCode.RATE_LIMIT).toBe("RATE_LIMIT");
    expect(ErrorCode.CONFLICT).toBe("CONFLICT");
    expect(ErrorCode.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    expect(ErrorCode.SERVICE_UNAVAILABLE).toBe("SERVICE_UNAVAILABLE");
    expect(ErrorCode.SUNO_API_ERROR).toBe("SUNO_API_ERROR");
    expect(ErrorCode.SUNO_RATE_LIMIT).toBe("SUNO_RATE_LIMIT");
    expect(ErrorCode.SUNO_AUTH_ERROR).toBe("SUNO_AUTH_ERROR");
    expect(ErrorCode.TIMEOUT).toBe("TIMEOUT");
  });
});

describe("apiError", () => {
  it("returns a response with the correct status", async () => {
    const res = apiError("Something went wrong", ErrorCode.INTERNAL_ERROR, 500);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Something went wrong");
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.details).toBeUndefined();
  });

  it("includes details when provided", async () => {
    const res = apiError("Bad input", ErrorCode.VALIDATION_ERROR, 400, { field: "email" });
    const body = await res.json();
    expect(body.details).toEqual({ field: "email" });
  });
});

describe("badRequest", () => {
  it("returns 400 with VALIDATION_ERROR code", async () => {
    const res = badRequest("Prompt is required");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Prompt is required");
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("includes details when provided", async () => {
    const res = badRequest("Invalid field", { field: "title" });
    const body = await res.json();
    expect(body.details).toEqual({ field: "title" });
  });
});

describe("unauthorized", () => {
  it("returns 401 with default message", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 with custom message", async () => {
    const res = unauthorized("Please log in");
    const body = await res.json();
    expect(body.error).toBe("Please log in");
  });
});

describe("forbidden", () => {
  it("returns 403 with default message", async () => {
    const res = forbidden();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(body.code).toBe("FORBIDDEN");
  });

  it("returns 403 with custom message", async () => {
    const res = forbidden("Admins only");
    const body = await res.json();
    expect(body.error).toBe("Admins only");
  });
});

describe("notFound", () => {
  it("returns 404 with default message", async () => {
    const res = notFound();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 404 with custom message", async () => {
    const res = notFound("Song not found");
    const body = await res.json();
    expect(body.error).toBe("Song not found");
  });
});

describe("rateLimited", () => {
  it("returns 429 with RATE_LIMIT code", async () => {
    const res = rateLimited("Too many requests");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
    expect(body.code).toBe("RATE_LIMIT");
  });

  it("includes details and headers", async () => {
    const res = rateLimited("Rate limit exceeded", { resetAt: "2026-03-23T15:00:00Z" }, { "Retry-After": "60" });
    const body = await res.json();
    expect(body.details).toEqual({ resetAt: "2026-03-23T15:00:00Z" });
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});

describe("internalError", () => {
  it("returns 500 with default message", async () => {
    const res = internalError();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("returns 500 with custom message", async () => {
    const res = internalError("Database unavailable");
    const body = await res.json();
    expect(body.error).toBe("Database unavailable");
  });
});

describe("serviceUnavailable", () => {
  it("returns 503 with SERVICE_UNAVAILABLE code", async () => {
    const res = serviceUnavailable("Service is down");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Service is down");
    expect(body.code).toBe("SERVICE_UNAVAILABLE");
  });
});
