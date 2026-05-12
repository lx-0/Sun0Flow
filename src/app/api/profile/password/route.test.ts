import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/auth", () => ({
  resolveUser: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { resolveUser } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/profile/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveUser).mockResolvedValue({
    userId: "user-1",
    isApiKey: false,
    isAdmin: false,
    error: null,
  } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    passwordHash: "stored-hash",
  } as never);
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  vi.mocked(bcrypt.hash).mockResolvedValue("new-hash" as never);
  vi.mocked(prisma.user.update).mockResolvedValue({} as never);
});

describe("POST /api/profile/password", () => {
  it("returns 401 when session is missing", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), { status: 401 }),
    } as never);

    const res = await POST(makeRequest({
      currentPassword: "oldpass123",
      newPassword: "newpass123",
      confirmPassword: "newpass123",
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest({
      currentPassword: "",
      newPassword: "newpass123",
      confirmPassword: "newpass123",
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("currentPassword");
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when new password is too short", async () => {
    const res = await POST(makeRequest({
      currentPassword: "oldpass123",
      newPassword: "short",
      confirmPassword: "short",
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("New password must be at least 8 characters");
  });

  it("returns 400 when new passwords do not match", async () => {
    const res = await POST(makeRequest({
      currentPassword: "oldpass123",
      newPassword: "newpass123",
      confirmPassword: "different123",
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Passwords do not match");
  });

  it("returns 404 when user record is missing", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const res = await POST(makeRequest({
      currentPassword: "oldpass123",
      newPassword: "newpass123",
      confirmPassword: "newpass123",
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("User not found");
    expect(data.code).toBe("NOT_FOUND");
  });

  it("returns 400 when current password does not match", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const res = await POST(makeRequest({
      currentPassword: "wrongpass123",
      newPassword: "newpass123",
      confirmPassword: "newpass123",
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Current password is incorrect");
  });

  it("updates password and returns success", async () => {
    const res = await POST(makeRequest({
      currentPassword: "oldpass123",
      newPassword: "newpass123",
      confirmPassword: "newpass123",
    }), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "new-hash" },
    });
    expect(await res.json()).toEqual({ success: true });
  });
});
