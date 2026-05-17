import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { resolveUserIdByUsername } from "@/lib/profile/public-user";

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
