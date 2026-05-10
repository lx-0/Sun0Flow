import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue("new-hashed-password"),
  },
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const seg = { params: Promise.resolve({}) };

const VALID_BODY = {
  currentPassword: "OldPass123",
  newPassword: "NewPass456",
  confirmPassword: "NewPass456",
};

const UNAUTH = {
  userId: null,
  isApiKey: false,
  isAdmin: false,
  error: new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), { status: 401 }),
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    passwordHash: "hashed-old-password",
  } as never);
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  vi.mocked(prisma.user.update).mockResolvedValue({} as never);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/auth/change-password", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated (no session)", async () => {
      vi.mocked(resolveUser).mockResolvedValue(UNAUTH as never);

      const res = await POST(makeRequest(VALID_BODY), seg);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 when session has no user id", async () => {
      vi.mocked(resolveUser).mockResolvedValue(UNAUTH as never);

      const res = await POST(makeRequest(VALID_BODY), seg);
      expect(res.status).toBe(401);
    });
  });

  describe("validation", () => {
    it("returns 400 when currentPassword is missing", async () => {
      const res = await POST(makeRequest({ newPassword: "NewPass456", confirmPassword: "NewPass456" }), seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when newPassword is missing", async () => {
      const res = await POST(makeRequest({ currentPassword: "OldPass123", confirmPassword: "NewPass456" }), seg);
      expect(res.status).toBe(400);
    });

    it("returns 400 when confirmPassword is missing", async () => {
      const res = await POST(makeRequest({ currentPassword: "OldPass123", newPassword: "NewPass456" }), seg);
      expect(res.status).toBe(400);
    });

    it("returns 400 when newPassword is too short (< 8 chars)", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, newPassword: "short", confirmPassword: "short" }), seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("8 characters");
    });

    it("returns 400 when newPassword and confirmPassword do not match", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, confirmPassword: "DifferentPass789" }), seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("do not match");
    });
  });

  describe("credential checks", () => {
    it("returns 404 when user record has no password hash", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: null } as never);

      const res = await POST(makeRequest(VALID_BODY), seg);
      expect(res.status).toBe(404);
    });

    it("returns 400 when current password is incorrect", async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      const res = await POST(makeRequest(VALID_BODY), seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("incorrect");
    });
  });

  describe("success", () => {
    it("updates password hash and returns success", async () => {
      const res = await POST(makeRequest(VALID_BODY), seg);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { passwordHash: "new-hashed-password" },
      });
    });

    it("hashes the new password with bcrypt before storing", async () => {
      await POST(makeRequest(VALID_BODY), seg);

      expect(bcrypt.hash).toHaveBeenCalledWith("NewPass456", 12);
    });
  });
});
