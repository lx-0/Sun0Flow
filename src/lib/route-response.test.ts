import { describe, expect, it } from "vitest";
import { requireOwned, resultResponse } from "@/lib/route-response";

describe("requireOwned", () => {
  it("returns data when record belongs to user", async () => {
    const result = requireOwned({ id: "1", userId: "u1" }, "u1", "Song");

    expect(result).toEqual({ data: { id: "1", userId: "u1" } });
  });

  it("returns not found when record is missing", async () => {
    const result = requireOwned<{ userId: string }>(null, "u1", "Song");

    expect(result.error?.status).toBe(404);
    await expect(result.error?.json()).resolves.toEqual({
      error: "Song not found",
      code: "NOT_FOUND",
    });
  });

  it("returns not found when record belongs to another user", async () => {
    const result = requireOwned({ id: "1", userId: "u2" }, "u1", "Song");

    expect(result.error?.status).toBe(404);
  });
});

describe("resultResponse", () => {
  it("maps success results to JSON response", async () => {
    const response = resultResponse({ ok: true, data: { ok: true } }, { status: 201 });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("maps failed results to API error response", async () => {
    const response = resultResponse({
      ok: false,
      error: "No access",
      code: "FORBIDDEN",
      status: 403,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "No access",
      code: "FORBIDDEN",
    });
  });
});
