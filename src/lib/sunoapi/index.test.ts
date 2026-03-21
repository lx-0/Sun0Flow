import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateSong,
  getTaskStatus,
  listSongs,
  getSongById,
  downloadSong,
  SunoApiError,
  sunoApi,
} from "./index";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_SONG = {
  id: "song-123",
  title: "Test Song",
  prompt: "A happy tune",
  tags: "pop",
  audioUrl: "https://cdn.sunoapi.org/audio/song-123.mp3",
  imageUrl: "https://cdn.sunoapi.org/images/song-123.jpg",
  duration: 120,
  status: "complete" as const,
  model: "chirp-v3",
  createdAt: "2026-03-19T00:00:00.000Z",
};

const MOCK_TASK_RESPONSE = {
  code: 200,
  msg: "success",
  data: { taskId: "task-abc123" },
};

const MOCK_TASK_STATUS_SUCCESS = {
  code: 200,
  msg: "success",
  data: {
    taskId: "task-abc123",
    status: "SUCCESS",
    errorMessage: null,
    response: {
      sunoData: [
        {
          id: "audio-1",
          title: "Generated Song",
          prompt: "upbeat pop",
          tags: "pop",
          audio_url: "https://cdn.sunoapi.org/audio/audio-1.mp3",
          image_url: "https://cdn.sunoapi.org/images/audio-1.jpg",
          duration: 180,
          model_name: "V4",
          createTime: "2026-03-19T00:00:00.000Z",
        },
      ],
    },
  },
};

// ─── fetch mock helpers ───────────────────────────────────────────────────────

function mockFetchOnce(body: unknown, status = 200): void {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function mockFetchError(status: number, message = "Server error"): void {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ msg: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  process.env.SUNOAPI_KEY = "test-api-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SUNOAPI_KEY;
});

// ─── generateSong ─────────────────────────────────────────────────────────────

describe("generateSong", () => {
  it("returns taskId on success", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);

    const result = await generateSong("A happy tune", { style: "pop" });

    expect(result.taskId).toBe("task-abc123");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("sends required fields: instrumental, customMode, model, callBackUrl", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    await generateSong("test", { title: "My Song", style: "rock" });

    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.instrumental).toBe(false);
    expect(body.customMode).toBe(true);
    expect(body.model).toBe("V4");
    expect(body.callBackUrl).toBeDefined();
    expect(body.title).toBe("My Song");
    expect(body.style).toBe("rock");
  });

  it("sets customMode=false when no title or style", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    await generateSong("upbeat electronic");

    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.customMode).toBe(false);
  });

  it("sends Authorization header with API key", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    await generateSong("test");

    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((callInit.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-api-key"
    );
  });

  it("throws SunoApiError(0) if SUNOAPI_KEY is not set", async () => {
    delete process.env.SUNOAPI_KEY;
    await expect(generateSong("test")).rejects.toThrow(SunoApiError);
    await expect(generateSong("test")).rejects.toMatchObject({ status: 0 });
  });

  it("throws SunoApiError for non-retryable 4xx errors", async () => {
    mockFetchError(400, "Bad request");
    const err = await generateSong("test").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SunoApiError);
    expect(err).toMatchObject({ status: 400, message: "Bad request" });
  });

  it("throws when response has no taskId", async () => {
    mockFetchOnce({ code: 200, msg: "success", data: {} });
    await expect(generateSong("test")).rejects.toThrow("No taskId returned");
  });
});

// ─── getTaskStatus ────────────────────────────────────────────────────────────

describe("getTaskStatus", () => {
  it("returns status and songs on success", async () => {
    mockFetchOnce(MOCK_TASK_STATUS_SUCCESS);

    const result = await getTaskStatus("task-abc123");

    expect(result.status).toBe("SUCCESS");
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].audioUrl).toBe("https://cdn.sunoapi.org/audio/audio-1.mp3");
    expect(result.songs[0].status).toBe("complete");
  });

  it("returns pending status when task is still processing", async () => {
    mockFetchOnce({
      code: 200,
      msg: "success",
      data: { taskId: "task-abc123", status: "PENDING", response: {} },
    });

    const result = await getTaskStatus("task-abc123");
    expect(result.status).toBe("PENDING");
    expect(result.songs).toHaveLength(0);
  });

  it("returns error status for failed tasks", async () => {
    mockFetchOnce({
      code: 200,
      msg: "success",
      data: {
        taskId: "task-abc123",
        status: "GENERATE_AUDIO_FAILED",
        errorMessage: "Content policy violation",
        response: {},
      },
    });

    const result = await getTaskStatus("task-abc123");
    expect(result.status).toBe("GENERATE_AUDIO_FAILED");
    expect(result.errorMessage).toBe("Content policy violation");
  });

  it("maps snake_case fields from API response", async () => {
    mockFetchOnce(MOCK_TASK_STATUS_SUCCESS);
    const result = await getTaskStatus("task-abc123");
    const song = result.songs[0];
    expect(song.audioUrl).toBe("https://cdn.sunoapi.org/audio/audio-1.mp3");
    expect(song.imageUrl).toBe("https://cdn.sunoapi.org/images/audio-1.jpg");
    expect(song.model).toBe("V4");
  });
});

// ─── listSongs ────────────────────────────────────────────────────────────────

describe("listSongs", () => {
  it("returns array of songs on success", async () => {
    mockFetchOnce({ clips: [MOCK_SONG] });

    const result = await listSongs();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Test Song");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/songs",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns empty array for empty response", async () => {
    mockFetchOnce({ clips: [] });
    const result = await listSongs();
    expect(result).toEqual([]);
  });
});

// ─── getSongById ──────────────────────────────────────────────────────────────

describe("getSongById", () => {
  it("returns a song on success (clip key)", async () => {
    mockFetchOnce({ clip: MOCK_SONG });

    const result = await getSongById("song-123");
    expect(result.id).toBe("song-123");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/songs/song-123",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns a song on success (data key)", async () => {
    mockFetchOnce({ data: MOCK_SONG });
    const result = await getSongById("song-123");
    expect(result.id).toBe("song-123");
  });

  it("throws SunoApiError(404) when song missing from response body", async () => {
    mockFetchOnce({});
    const err = await getSongById("song-123").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SunoApiError);
    expect(err).toMatchObject({ status: 404 });
  });

  it("URL-encodes the song ID", async () => {
    mockFetchOnce({ clip: MOCK_SONG });
    await getSongById("song/with/slashes");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/songs/song%2Fwith%2Fslashes",
      expect.any(Object)
    );
  });
});

// ─── downloadSong ─────────────────────────────────────────────────────────────

describe("downloadSong", () => {
  it("fetches the audioUrl and returns ArrayBuffer", async () => {
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33]).buffer;

    // First call: getSongById
    mockFetchOnce({ clip: MOCK_SONG });
    // Second call: download the audio
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(audioBytes, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })
    );

    const result = await downloadSong("song-123");
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      MOCK_SONG.audioUrl,
      expect.objectContaining({ method: "GET" })
    );
  });
});

// ─── 429 retry logic ──────────────────────────────────────────────────────────

describe("retry on 429", () => {
  it("retries up to 3 times on 429 and succeeds", async () => {
    vi.useFakeTimers();

    // First 3 calls: 429, then success
    mockFetchError(429, "Rate limited");
    mockFetchError(429, "Rate limited");
    mockFetchError(429, "Rate limited");
    mockFetchOnce({ clips: [MOCK_SONG] });

    const promise = listSongs();

    // Advance timers to let retries fire (200ms + 400ms + 800ms)
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  it("throws SunoApiError after max retries exceeded", async () => {
    vi.useFakeTimers();

    // 4 failures (initial + 3 retries)
    mockFetchError(429, "Rate limited");
    mockFetchError(429, "Rate limited");
    mockFetchError(429, "Rate limited");
    mockFetchError(429, "Rate limited");

    // Attach catch BEFORE running timers to avoid unhandled rejection
    const errPromise = listSongs().catch((e: unknown) => e);
    await vi.runAllTimersAsync();

    const err = await errPromise;
    expect(err).toBeInstanceOf(SunoApiError);
    expect(err).toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(4); // initial + 3 retries

    vi.useRealTimers();
  });
});

// ─── Non-retryable error propagation ─────────────────────────────────────────

describe("non-retryable error propagation", () => {
  it("does not retry on 401", async () => {
    mockFetchError(401, "Unauthorized");
    await expect(listSongs()).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 403", async () => {
    mockFetchError(403, "Forbidden");
    await expect(listSongs()).rejects.toMatchObject({ status: 403 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 404", async () => {
    mockFetchError(404, "Not found");
    await expect(listSongs()).rejects.toMatchObject({ status: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and eventually throws", async () => {
    vi.useFakeTimers();

    mockFetchError(500, "Internal Server Error");
    mockFetchError(500, "Internal Server Error");
    mockFetchError(500, "Internal Server Error");
    mockFetchError(500, "Internal Server Error");

    // Attach catch BEFORE running timers to avoid unhandled rejection
    const errPromise = listSongs().catch((e: unknown) => e);
    await vi.runAllTimersAsync();

    const err = await errPromise;
    expect(err).toBeInstanceOf(SunoApiError);
    expect(err).toMatchObject({ status: 500 });
    expect(fetch).toHaveBeenCalledTimes(4); // initial + 3 retries

    vi.useRealTimers();
  });
});

// ─── sunoApi convenience export ───────────────────────────────────────────────

describe("sunoApi singleton", () => {
  it("exposes all five methods", () => {
    expect(typeof sunoApi.generateSong).toBe("function");
    expect(typeof sunoApi.getTaskStatus).toBe("function");
    expect(typeof sunoApi.listSongs).toBe("function");
    expect(typeof sunoApi.getSongById).toBe("function");
    expect(typeof sunoApi.downloadSong).toBe("function");
  });
});
