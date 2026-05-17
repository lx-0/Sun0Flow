import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    follow: {
      findUnique: vi.fn(),
    },
    song: {
      findFirst: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { getPublicUserProfileByUsername, resolveUserIdByUsername } from "@/lib/profile/public-user";

describe("resolveUserIdByUsername", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user id when username exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_123" } as never);

    const result = await resolveUserIdByUsername("alice");

    expect(result).toEqual({ ok: true, data: { id: "user_123" } });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: "alice" },
      select: { id: true },
    });
  });

  it("returns not found result when username does not exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await resolveUserIdByUsername("missing");

    expect(result).toEqual({
      ok: false,
      error: "User not found",
      code: "NOT_FOUND",
      status: 404,
    });
  });
});

describe("getPublicUserProfileByUsername", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not found when username is missing", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await getPublicUserProfileByUsername("missing", "viewer_1");

    expect(result).toEqual({
      ok: false,
      error: "User not found",
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("returns profile with follow state and featured song", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_123",
      name: "Alice",
      username: "alice",
      image: "img",
      avatarUrl: "avatar",
      bannerUrl: "banner",
      bio: "bio",
      featuredSongId: "song_1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      _count: { followers: 3, following: 5, songs: 2 },
    } as never);
    vi.mocked(prisma.follow.findUnique).mockResolvedValue({ id: "follow_1" } as never);
    vi.mocked(prisma.song.findFirst).mockResolvedValue({
      id: "song_1",
      title: "Track",
      imageUrl: "cover",
      audioUrl: "audio",
      duration: 120,
      tags: ["pop"],
      publicSlug: "track",
    } as never);
    vi.mocked(prisma.song.aggregate).mockResolvedValue({ _sum: { playCount: 42 } } as never);

    const result = await getPublicUserProfileByUsername("alice", "viewer_1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.totalPlays).toBe(42);
    expect(result.data.isFollowing).toBe(true);
    expect(result.data.featuredSong?.id).toBe("song_1");
    expect(prisma.follow.findUnique).toHaveBeenCalledOnce();
    expect(prisma.song.findFirst).toHaveBeenCalledOnce();
    expect(prisma.song.aggregate).toHaveBeenCalledOnce();
  });

  it("skips follow lookup for self-view and defaults total plays to zero", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_123",
      name: null,
      username: "alice",
      image: null,
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
      featuredSongId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      _count: { followers: 0, following: 0, songs: 0 },
    } as never);
    vi.mocked(prisma.song.aggregate).mockResolvedValue({ _sum: { playCount: null } } as never);

    const result = await getPublicUserProfileByUsername("alice", "user_123");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.isFollowing).toBe(false);
    expect(result.data.featuredSong).toBeNull();
    expect(result.data.totalPlays).toBe(0);
    expect(prisma.follow.findUnique).not.toHaveBeenCalled();
    expect(prisma.song.findFirst).not.toHaveBeenCalled();
  });
});
