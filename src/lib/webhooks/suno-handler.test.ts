import { beforeEach, describe, expect, it, vi } from "vitest";
import { processSunoWebhook } from "./suno-handler";

const mockInfo = vi.fn();
const mockWarn = vi.fn();

vi.mock("@/lib/logger", () => ({
  logger: {
    info: (...args: unknown[]) => mockInfo(...args),
    warn: (...args: unknown[]) => mockWarn(...args),
  },
}));

describe("processSunoWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not_found when no song matches taskId", async () => {
    const result = await processSunoWebhook(
      {
        taskId: "task-1",
        status: "SUCCESS",
        payload: { data: { taskId: "task-1", status: "SUCCESS" } },
      },
      {
        findSongByTaskId: vi.fn().mockResolvedValue(null),
        handleSongSuccess: vi.fn(),
        handleSongFailure: vi.fn(),
      },
    );

    expect(result).toEqual({ kind: "not_found" });
    expect(mockWarn).toHaveBeenCalled();
  });

  it("returns duplicate for already terminal songs", async () => {
    const result = await processSunoWebhook(
      {
        taskId: "task-2",
        status: "SUCCESS",
        payload: { data: { taskId: "task-2", status: "SUCCESS" } },
      },
      {
        findSongByTaskId: vi.fn().mockResolvedValue({ generationStatus: "ready" }),
        handleSongSuccess: vi.fn(),
        handleSongFailure: vi.fn(),
      } as never,
    );

    expect(result).toEqual({ kind: "duplicate" });
    expect(mockInfo).toHaveBeenCalled();
  });

  it("handles SUCCESS callbacks with mapped songs", async () => {
    const handleSongSuccess = vi.fn().mockResolvedValue(undefined);
    const result = await processSunoWebhook(
      {
        taskId: "task-3",
        status: "SUCCESS",
        payload: {
          data: {
            taskId: "task-3",
            status: "SUCCESS",
            response: {
              sunoData: [{ id: "audio-1", title: "Song", audio_url: "https://audio.test/song.mp3" }],
            },
          },
        },
      },
      {
        findSongByTaskId: vi.fn().mockResolvedValue({ id: "song-1", generationStatus: "pending" }),
        handleSongSuccess,
        handleSongFailure: vi.fn(),
      } as never,
    );

    expect(result).toEqual({ kind: "processed" });
    expect(handleSongSuccess).toHaveBeenCalledTimes(1);
    const [, songs] = handleSongSuccess.mock.calls[0];
    expect(songs).toHaveLength(1);
    expect(songs[0].status).toBe("complete");
  });

  it("handles terminal failure callbacks", async () => {
    const handleSongFailure = vi.fn().mockResolvedValue(undefined);
    const result = await processSunoWebhook(
      {
        taskId: "task-4",
        status: "GENERATE_AUDIO_FAILED",
        payload: {
          data: { taskId: "task-4", status: "GENERATE_AUDIO_FAILED", errorMessage: "bad request" },
        },
      },
      {
        findSongByTaskId: vi.fn().mockResolvedValue({ id: "song-2", generationStatus: "pending" }),
        handleSongSuccess: vi.fn(),
        handleSongFailure,
      } as never,
    );

    expect(result).toEqual({ kind: "processed" });
    expect(handleSongFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "song-2" }),
      "bad request",
    );
  });
});
