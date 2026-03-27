import { describe, it, expect, vi, beforeEach } from "vitest";
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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("new-hashed-password"),
  },
}));

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_USER = { id: "user-1", email: "test@example.com" };
const VALID_BODY = { token: "valid-reset-token", password: "NewPassword123" };

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(prisma.user.findFirst).mockResolvedValue(VALID_USER as never);
  vi.mocked(prisma.user.update).mockResolvedValue({} as never);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/auth/reset-password", () => {
  describe("validation", () => {
    it("returns 400 when token is missing", async () => {
      const res = await POST(makeRequest({ password: "NewPassword123" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when password is missing", async () => {
      const res = await POST(makeRequest({ token: "valid-reset-token" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when password is too short (< 8 chars)", async () => {
      const res = await POST(makeRequest({ token: "valid-reset-token", password: "short" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("8 characters");
    });
  });

  describe("token validation", () => {
    it("returns 400 when token is invalid (user not found)", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid or expired");
    });

    it("queries for non-expired tokens only", async () => {
      await POST(makeRequest(VALID_BODY));

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          resetToken: "valid-reset-token",
          resetTokenExpiry: { gt: expect.any(Date) },
        },
      });
    });
  });

  describe("success", () => {
    it("returns 200 with success message", async () => {
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe("Password reset successfully");
    });

    it("hashes the new password with bcrypt cost 12", async () => {
      await POST(makeRequest(VALID_BODY));
      expect(bcrypt.hash).toHaveBeenCalledWith("NewPassword123", 12);
    });

    it("updates user with new password hash and clears reset token", async () => {
      await POST(makeRequest(VALID_BODY));

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          passwordHash: "new-hashed-password",
          resetToken: null,
          resetTokenExpiry: null,
        },
      });
    });
  });
});
