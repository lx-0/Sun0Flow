import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  env: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));
vi.mock("@/lib/event-bus", () => ({ broadcast: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: vi.fn(),
  cacheKey: (...parts: string[]) => parts.join(":"),
}));
vi.mock("@/lib/push", () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email", () => ({
  sendGenerationCompleteEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { sendGenerationCompleteEmail } from "@/lib/email";
import { notifyUser } from "./index";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.notification.create).mockResolvedValue({
    id: "notif-1",
    userId: "user-1",
    type: "generation_complete",
  } as never);
});

describe("notifyUser channel dispatch", () => {
  it("skips the prefs lookup entirely when the type has no push/email channels", async () => {
    await notifyUser({
      userId: "user-1",
      type: "announcement",
      title: "T",
      message: "M",
    });
    expect(prisma.notification.create).toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(sendGenerationCompleteEmail).not.toHaveBeenCalled();
  });

  it("fires push for generation_complete when the user's push pref is unset (default = on)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      pushGenerationComplete: null,
    } as never);
    await notifyUser({
      userId: "user-1",
      type: "generation_complete",
      title: "T",
      message: "M",
      email: false,
    });
    expect(sendPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ title: "T", body: "M" }),
    );
  });

  it("skips push when the user's push pref is explicitly false", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      pushGenerationComplete: false,
    } as never);
    await notifyUser({
      userId: "user-1",
      type: "generation_complete",
      title: "T",
      message: "M",
      email: false,
    });
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("skips push when the caller opts out with push:false", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      pushGenerationComplete: true,
      emailGenerationComplete: false,
    } as never);
    await notifyUser({
      userId: "user-1",
      type: "generation_complete",
      title: "T",
      message: "M",
      push: false,
    });
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("threads the push tag from caller into the push payload", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      pushGenerationComplete: true,
    } as never);
    await notifyUser({
      userId: "user-1",
      type: "generation_complete",
      title: "T",
      message: "M",
      push: { tag: "gen-song-1" },
      email: false,
    });
    expect(sendPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ tag: "gen-song-1" }),
    );
  });

  it("sends generation-complete email when user has email + token + pref is on", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      pushGenerationComplete: false,
      emailGenerationComplete: true,
      email: "a@b.test",
      unsubscribeToken: "tok-existing",
    } as never);
    await notifyUser({
      userId: "user-1",
      type: "generation_complete",
      title: "Song Title",
      message: "M",
      songId: "song-1",
    });
    expect(sendGenerationCompleteEmail).toHaveBeenCalledWith(
      "a@b.test",
      { id: "song-1", title: "Song Title" },
      "tok-existing",
    );
  });

  it("skips email when the user has no email address on file", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      emailGenerationComplete: true,
      email: null,
      unsubscribeToken: "tok",
    } as never);
    await notifyUser({
      userId: "user-1",
      type: "generation_complete",
      title: "T",
      message: "M",
      push: false,
    });
    expect(sendGenerationCompleteEmail).not.toHaveBeenCalled();
  });

  it("creates a fresh unsubscribe token when one is missing, then sends email with it", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      emailGenerationComplete: true,
      email: "a@b.test",
      unsubscribeToken: null,
    } as never);
    await notifyUser({
      userId: "user-1",
      type: "generation_complete",
      title: "T",
      message: "M",
      songId: "song-1",
      push: false,
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ unsubscribeToken: expect.any(String) }),
      }),
    );
    expect(sendGenerationCompleteEmail).toHaveBeenCalled();
  });

  it("does not call sendGenerationCompleteEmail for unrelated notification types", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      pushSongComment: true,
    } as never);
    await notifyUser({
      userId: "user-1",
      type: "song_comment",
      title: "T",
      message: "M",
    });
    expect(sendPushToUser).toHaveBeenCalled();
    expect(sendGenerationCompleteEmail).not.toHaveBeenCalled();
  });

  it("returns the created notification even when the prefs lookup throws", async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("DB down"));
    const result = await notifyUser({
      userId: "user-1",
      type: "generation_complete",
      title: "T",
      message: "M",
    });
    expect(result).toMatchObject({ id: "notif-1" });
    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(sendGenerationCompleteEmail).not.toHaveBeenCalled();
  });
});
