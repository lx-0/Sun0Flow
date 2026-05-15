import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    songEmbedding: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { scoreByEmbedding } from "./rank";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scoreByEmbedding", () => {
  it("returns empty array when no candidates exist", async () => {
    vi.mocked(prisma.songEmbedding.findMany).mockResolvedValue([]);

    const result = await scoreByEmbedding([1, 0, 0], {}, 5);

    expect(result).toEqual([]);
  });

  it("scores candidates by cosine similarity and returns top N", async () => {
    vi.mocked(prisma.songEmbedding.findMany).mockResolvedValue([
      { songId: "song-a", embedding: [0, 1, 0] },
      { songId: "song-b", embedding: [0.9, 0.1, 0] },
      { songId: "song-c", embedding: [0.5, 0.5, 0] },
    ] as never);

    const result = await scoreByEmbedding([1, 0, 0], {}, 2);

    expect(result).toHaveLength(2);
    expect(result[0].songId).toBe("song-b");
    expect(result[1].songId).toBe("song-c");
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("assigns score 0 when embedding cannot be parsed", async () => {
    vi.mocked(prisma.songEmbedding.findMany).mockResolvedValue([
      { songId: "song-a", embedding: [] },
      { songId: "song-b", embedding: [0.9, 0.1] },
    ] as never);

    const result = await scoreByEmbedding([1, 0], {}, 10);

    expect(result).toHaveLength(2);
    expect(result[0].songId).toBe("song-b");
    expect(result[1].songId).toBe("song-a");
    expect(result[1].score).toBe(0);
  });

  it("passes where clause and candidateLimit to Prisma", async () => {
    vi.mocked(prisma.songEmbedding.findMany).mockResolvedValue([]);

    const where = { songId: { not: "song-x" }, song: { userId: "user-1" } };
    await scoreByEmbedding([1], where, 5, 100);

    expect(prisma.songEmbedding.findMany).toHaveBeenCalledWith({
      where,
      select: { songId: true, embedding: true },
      take: 100,
    });
  });
});
