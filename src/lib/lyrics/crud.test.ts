import { beforeEach, describe, expect, it, vi } from "vitest";
import { Err } from "@/lib/result";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: { findFirst: vi.fn() },
    lyricAnnotation: { findMany: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() },
    lyricTimestamp: { findMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import {
  listLyricAnnotations,
  listLyricTimestamps,
  replaceLyricTimestamps,
  upsertLyricAnnotation,
} from "./crud";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lyrics CRUD helpers", () => {
  it("returns not found for non-owned song on annotation list", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue(null as never);

    const result = await listLyricAnnotations("song-1", "user-1");

    expect(result).toEqual(Err.notFound("Not found"));
    expect(vi.mocked(prisma.lyricAnnotation.findMany)).not.toHaveBeenCalled();
  });

  it("lists annotations for owned song", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue({ id: "song-1" } as never);
    vi.mocked(prisma.lyricAnnotation.findMany).mockResolvedValue([
      { lineIndex: 0, body: "Line 1" },
      { lineIndex: 1, body: "Line 2" },
    ] as never);

    const result = await listLyricAnnotations("song-1", "user-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.annotations).toEqual([
        { lineIndex: 0, body: "Line 1" },
        { lineIndex: 1, body: "Line 2" },
      ]);
    }
  });

  it("deletes annotation when body is blank", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue({ id: "song-1" } as never);

    const result = await upsertLyricAnnotation("song-1", "user-1", {
      lineIndex: 4,
      body: "   ",
    });

    expect(vi.mocked(prisma.lyricAnnotation.deleteMany)).toHaveBeenCalledWith({
      where: { songId: "song-1", lineIndex: 4 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ ok: true, deleted: true });
  });

  it("upserts annotation when body is non-empty", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue({ id: "song-1" } as never);

    const result = await upsertLyricAnnotation("song-1", "user-1", {
      lineIndex: 2,
      body: "  Chorus  ",
    });

    expect(vi.mocked(prisma.lyricAnnotation.upsert)).toHaveBeenCalledWith({
      where: { songId_lineIndex: { songId: "song-1", lineIndex: 2 } },
      create: { songId: "song-1", lineIndex: 2, body: "Chorus" },
      update: { body: "Chorus" },
    });
    expect(result.ok).toBe(true);
  });

  it("lists timestamps for owned song", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue({ id: "song-1" } as never);
    vi.mocked(prisma.lyricTimestamp.findMany).mockResolvedValue([
      { lineIndex: 0, startTime: 0.1 },
      { lineIndex: 1, startTime: 2.4 },
    ] as never);

    const result = await listLyricTimestamps("song-1", "user-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.timestamps).toEqual([
        { lineIndex: 0, startTime: 0.1 },
        { lineIndex: 1, startTime: 2.4 },
      ]);
    }
  });

  it("replaces timestamps with transactional upserts", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue({ id: "song-1" } as never);
    vi.mocked(prisma.lyricTimestamp.upsert).mockImplementation((args: unknown) => args as never);

    const entries = [
      { lineIndex: 0, startTime: 0 },
      { lineIndex: 1, startTime: 3.2 },
    ];

    const result = await replaceLyricTimestamps("song-1", "user-1", entries);

    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalledWith([
      {
        where: { songId_lineIndex: { songId: "song-1", lineIndex: 0 } },
        create: { songId: "song-1", lineIndex: 0, startTime: 0 },
        update: { startTime: 0 },
      },
      {
        where: { songId_lineIndex: { songId: "song-1", lineIndex: 1 } },
        create: { songId: "song-1", lineIndex: 1, startTime: 3.2 },
        update: { startTime: 3.2 },
      },
    ]);
    expect(result.ok).toBe(true);
  });
});
