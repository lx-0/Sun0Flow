import { describe, it, expect, vi } from "vitest";
import { retrySong, pollSongStatus, mergeSongIntoList } from "./retry-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("retrySong", () => {
  it("returns ok and the new song on 200 success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ song: { id: "s1", generationStatus: "pending", errorMessage: null } }),
    );
    const result = await retrySong("s1", { fetch: fetchMock });
    expect(result).toEqual({
      kind: "ok",
      song: { id: "s1", generationStatus: "pending", errorMessage: null },
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/songs/s1/retry", { method: "POST" });
  });

  it("returns soft-error when 200 carries an error message (Suno rejected)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        song: { id: "s1", generationStatus: "failed", errorMessage: "Content policy" },
        error: "Content policy",
      }),
    );
    const result = await retrySong("s1", { fetch: fetchMock });
    expect(result.kind).toBe("soft-error");
    if (result.kind === "soft-error") {
      expect(result.song?.id).toBe("s1");
      expect(result.message).toBe("Content policy");
    }
  });

  it("returns rate-limit with minutes-until-reset on 429", async () => {
    const now = 1_700_000_000_000;
    const resetAt = new Date(now + 5 * 60_000).toISOString();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ resetAt }, 429));
    const result = await retrySong("s1", { fetch: fetchMock, now: () => now });
    expect(result).toEqual({ kind: "rate-limit", minutesUntilReset: 5 });
  });

  it("rate-limit floors to at least 1 minute when reset is in the past", async () => {
    const now = 1_700_000_000_000;
    const resetAt = new Date(now - 10_000).toISOString();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ resetAt }, 429));
    const result = await retrySong("s1", { fetch: fetchMock, now: () => now });
    expect(result).toEqual({ kind: "rate-limit", minutesUntilReset: 1 });
  });

  it("returns error with server message on non-2xx non-429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "Boom" }, 500));
    const result = await retrySong("s1", { fetch: fetchMock });
    expect(result).toEqual({ kind: "error", message: "Boom" });
  });

  it("falls back to generic message when server omits error field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const result = await retrySong("s1", { fetch: fetchMock });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/retry failed/i);
    }
  });

  it("returns network-error when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    const result = await retrySong("s1", { fetch: fetchMock });
    expect(result).toEqual({ kind: "network-error" });
  });

  it("returns error when 200 has neither song nor error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const result = await retrySong("s1", { fetch: fetchMock });
    expect(result.kind).toBe("error");
  });

  it("returns error when response is non-JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("not json", { status: 200, headers: { "Content-Type": "text/plain" } }),
    );
    const result = await retrySong("s1", { fetch: fetchMock });
    expect(result.kind).toBe("error");
  });
});

describe("pollSongStatus", () => {
  it("returns ok with song on 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ song: { id: "s1", generationStatus: "ready" } }),
    );
    const result = await pollSongStatus("s1", { fetch: fetchMock });
    expect(result).toEqual({ kind: "ok", song: { id: "s1", generationStatus: "ready" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/songs/s1/status");
  });

  it("returns error on non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    const result = await pollSongStatus("s1", { fetch: fetchMock });
    expect(result).toEqual({ kind: "error" });
  });

  it("returns error on missing song", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const result = await pollSongStatus("s1", { fetch: fetchMock });
    expect(result).toEqual({ kind: "error" });
  });

  it("returns error when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    const result = await pollSongStatus("s1", { fetch: fetchMock });
    expect(result).toEqual({ kind: "error" });
  });
});

describe("mergeSongIntoList", () => {
  it("replaces fields on matching id only, leaves others untouched", () => {
    const list = [
      { id: "a", generationStatus: "failed", title: "A" },
      { id: "b", generationStatus: "failed", title: "B" },
    ];
    const merged = mergeSongIntoList(list, { id: "a", generationStatus: "pending" });
    expect(merged).toEqual([
      { id: "a", generationStatus: "pending", title: "A" },
      { id: "b", generationStatus: "failed", title: "B" },
    ]);
  });

  it("is a no-op when id is unknown", () => {
    const list = [{ id: "a", title: "A" }];
    const merged = mergeSongIntoList(list, { id: "missing", title: "X" });
    expect(merged).toEqual(list);
  });

  it("returns a new array (immutable)", () => {
    const list = [{ id: "a", title: "A" }];
    const merged = mergeSongIntoList(list, { id: "a", title: "B" });
    expect(merged).not.toBe(list);
    expect(merged[0]).not.toBe(list[0]);
  });
});
