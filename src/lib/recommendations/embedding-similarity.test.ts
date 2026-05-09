import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    songEmbedding: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    song: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { findSimilarByEmbedding } from "./embedding-similarity";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findSimilarByEmbedding", () => {
  it("returns null when target song has no embedding", async () => {
    vi.mocked(prisma.songEmbedding.findUnique).mockResolvedValue(null);

    const result = await findSimilarByEmbedding("song-1", "user-1", 5);

    expect(result).toBeNull();
    expect(prisma.songEmbedding.findMany).not.toHaveBeenCalled();
  });

  it("returns null when embedding vector is empty", async () => {
    vi.mocked(prisma.songEmbedding.findUnique).mockResolvedValue({
      id: "emb-1",
      model: "text-embedding-3-small",
      songId: "song-1",
      embedding: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await findSimilarByEmbedding("song-1", "user-1", 5);

    expect(result).toBeNull();
  });

  it("returns empty songs when no candidates exist", async () => {
    vi.mocked(prisma.songEmbedding.findUnique).mockResolvedValue({
      id: "emb-1",
      model: "text-embedding-3-small",
      songId: "song-1",
      embedding: [0.1, 0.2, 0.3],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.songEmbedding.findMany).mockResolvedValue([]);

    const result = await findSimilarByEmbedding("song-1", "user-1", 5);

    expect(result).toEqual({ songs: [], total: 0 });
  });

  it("scores, sorts, and hydrates candidates", async () => {
    const queryVec = [1, 0, 0];
    vi.mocked(prisma.songEmbedding.findUnique).mockResolvedValue({
      id: "emb-1",
      model: "text-embedding-3-small",
      songId: "song-1",
      embedding: queryVec,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.songEmbedding.findMany).mockResolvedValue([
      { songId: "song-2", embedding: [0, 1, 0] },
      { songId: "song-3", embedding: [0.9, 0.1, 0] },
    ] as never);

    const now = new Date("2026-01-01T00:00:00Z");
    vi.mocked(prisma.song.findMany).mockResolvedValue([
      { id: "song-2", title: "Orthogonal", tags: "pop", imageUrl: null, duration: 120, audioUrl: "/a2.mp3", createdAt: now },
      { id: "song-3", title: "Similar", tags: "rock", imageUrl: null, duration: 180, audioUrl: "/a3.mp3", createdAt: now },
    ] as never);

    const result = await findSimilarByEmbedding("song-1", "user-1", 5);

    expect(result).not.toBeNull();
    expect(result!.songs).toHaveLength(2);
    expect(result!.songs[0].id).toBe("song-3");
    expect(result!.songs[0].score).toBeGreaterThan(result!.songs[1].score);
    expect(result!.songs[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("respects the limit parameter", async () => {
    vi.mocked(prisma.songEmbedding.findUnique).mockResolvedValue({
      id: "emb-1",
      model: "text-embedding-3-small",
      songId: "song-1",
      embedding: [1, 0],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.songEmbedding.findMany).mockResolvedValue([
      { songId: "song-2", embedding: [0.9, 0.1] },
      { songId: "song-3", embedding: [0.5, 0.5] },
      { songId: "song-4", embedding: [0.1, 0.9] },
    ] as never);

    const now = new Date("2026-01-01T00:00:00Z");
    vi.mocked(prisma.song.findMany).mockResolvedValue([
      { id: "song-2", title: "A", tags: null, imageUrl: null, duration: 60, audioUrl: "/a.mp3", createdAt: now },
    ] as never);

    const result = await findSimilarByEmbedding("song-1", "user-1", 1);

    expect(result!.songs).toHaveLength(1);
    expect(result!.total).toBe(1);
  });
});
