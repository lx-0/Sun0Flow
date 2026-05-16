import { describe, it, expect, vi } from "vitest";
import { selectTerminalTransition, fetchSongAfterTerminal } from "./useTrackPendingSong";
import type { GenerationState } from "@/lib/realtime/generation-tracker";

function makeState(overrides: Partial<GenerationState> = {}): GenerationState {
  return {
    songId: "song-1",
    status: "pending",
    title: null,
    errorMessage: null,
    ...overrides,
  };
}

describe("selectTerminalTransition", () => {
  it("returns null when the song is not in the snapshot", () => {
    expect(selectTerminalTransition([], "missing-id")).toBeNull();
  });

  it("returns null while the song is still pending", () => {
    const snap = [makeState({ status: "pending" })];
    expect(selectTerminalTransition(snap, "song-1")).toBeNull();
  });

  it("returns null while the song is still processing", () => {
    const snap = [makeState({ status: "processing" })];
    expect(selectTerminalTransition(snap, "song-1")).toBeNull();
  });

  it("returns 'ready' when the matching song has flipped to ready", () => {
    const snap = [makeState({ status: "ready" })];
    expect(selectTerminalTransition(snap, "song-1")).toBe("ready");
  });

  it("returns 'failed' when the matching song has flipped to failed", () => {
    const snap = [makeState({ status: "failed", errorMessage: "boom" })];
    expect(selectTerminalTransition(snap, "song-1")).toBe("failed");
  });

  it("filters by songId — sibling terminal states must not leak", () => {
    const snap = [
      makeState({ songId: "song-1", status: "pending" }),
      makeState({ songId: "song-2", status: "ready" }),
    ];
    expect(selectTerminalTransition(snap, "song-1")).toBeNull();
    expect(selectTerminalTransition(snap, "song-2")).toBe("ready");
  });
});

describe("fetchSongAfterTerminal", () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("returns the song from a 200 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ song: { id: "song-1", generationStatus: "ready", title: "Cool Track" } }),
    );
    const result = await fetchSongAfterTerminal("song-1", fetchMock);
    expect(result).toEqual({ id: "song-1", generationStatus: "ready", title: "Cool Track" });
    expect(fetchMock).toHaveBeenCalledWith("/api/songs/song-1/status");
  });

  it("returns null on non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    expect(await fetchSongAfterTerminal("song-1", fetchMock)).toBeNull();
  });

  it("returns null when the response body omits the song", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    expect(await fetchSongAfterTerminal("song-1", fetchMock)).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    expect(await fetchSongAfterTerminal("song-1", fetchMock)).toBeNull();
  });

  it("returns null on non-JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("not json", { status: 200, headers: { "Content-Type": "text/plain" } }),
    );
    expect(await fetchSongAfterTerminal("song-1", fetchMock)).toBeNull();
  });
});
