import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  env: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  readyTransition,
  pendingRetryTransition,
  buildFailedTransition,
  markSongFailedSimple,
  markSongPendingRetry,
  markSongReadyNoApi,
} from "./lifecycle";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readyTransition constant", () => {
  it("clears archivedAt + errorMessage on the way to ready", () => {
    expect(readyTransition).toEqual({
      generationStatus: "ready",
      errorMessage: null,
      archivedAt: null,
    });
  });
});

describe("pendingRetryTransition constant", () => {
  it("clears archivedAt + errorMessage + resets pollCount", () => {
    expect(pendingRetryTransition).toEqual({
      generationStatus: "pending",
      errorMessage: null,
      pollCount: 0,
      archivedAt: null,
    });
  });
});

describe("buildFailedTransition", () => {
  it("sets archivedAt = now when row had no prior archive", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({ archivedAt: null } as never);
    const t = await buildFailedTransition("song-1", "boom");
    expect(t.generationStatus).toBe("failed");
    expect(t.errorMessage).toBe("boom");
    expect(t.archivedAt).toBeInstanceOf(Date);
  });

  it("preserves a user-set archivedAt rather than overwriting it", async () => {
    const userSet = new Date("2026-01-01T00:00:00Z");
    vi.mocked(prisma.song.findUnique).mockResolvedValue({ archivedAt: userSet } as never);
    const t = await buildFailedTransition("song-1", "boom");
    expect(t.archivedAt).toBe(userSet);
  });

  it("handles a missing row gracefully by archiving now", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue(null as never);
    const t = await buildFailedTransition("song-1", "boom");
    expect(t.archivedAt).toBeInstanceOf(Date);
  });
});

describe("markSongFailedSimple", () => {
  it("writes a failed transition without side-effects", async () => {
    vi.mocked(prisma.song.findUnique).mockResolvedValue({ archivedAt: null } as never);
    await markSongFailedSimple("song-1", "No Suno task ID");
    expect(prisma.song.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "song-1" },
        data: expect.objectContaining({
          generationStatus: "failed",
          errorMessage: "No Suno task ID",
        }),
      }),
    );
  });
});

describe("markSongPendingRetry", () => {
  it("attaches the new sunoJobId and applies the pending-retry transition", async () => {
    await markSongPendingRetry("song-1", "task-new");
    expect(prisma.song.update).toHaveBeenCalledWith({
      where: { id: "song-1" },
      data: {
        sunoJobId: "task-new",
        generationStatus: "pending",
        errorMessage: null,
        pollCount: 0,
        archivedAt: null,
      },
    });
  });
});

describe("markSongReadyNoApi", () => {
  it("applies the ready transition and resets pollCount", async () => {
    await markSongReadyNoApi("song-1");
    expect(prisma.song.update).toHaveBeenCalledWith({
      where: { id: "song-1" },
      data: {
        generationStatus: "ready",
        errorMessage: null,
        archivedAt: null,
        pollCount: 0,
      },
    });
  });
});
