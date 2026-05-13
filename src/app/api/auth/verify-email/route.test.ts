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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  resolveUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { prisma } from "@/lib/prisma";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const seg = { params: Promise.resolve({}) };

const UNVERIFIED_USER = { id: "user-1", email: "test@example.com", emailVerified: null };
const VERIFIED_USER = { id: "user-1", email: "test@example.com", emailVerified: new Date("2025-01-01") };

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(prisma.user.findFirst).mockResolvedValue(UNVERIFIED_USER as never);
  vi.mocked(prisma.user.update).mockClear().mockResolvedValue({} as never);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/auth/verify-email", () => {
  describe("validation", () => {
    it("returns 400 when token is missing", async () => {
      const res = await POST(makeRequest({}), seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("token validation", () => {
    it("returns 400 when token is invalid (user not found)", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const res = await POST(makeRequest({ token: "invalid-token" }), seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid verification token");
    });

    it("queries by verificationToken", async () => {
      await POST(makeRequest({ token: "my-token" }), seg);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { verificationToken: "my-token" },
      });
    });
  });

  describe("already verified", () => {
    it("returns 200 with 'already verified' message when email is already verified", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(VERIFIED_USER as never);

      const res = await POST(makeRequest({ token: "some-token" }), seg);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain("already verified");
    });

    it("does not update the user when already verified", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(VERIFIED_USER as never);

      await POST(makeRequest({ token: "some-token" }), seg);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("success", () => {
    it("returns 200 with success message", async () => {
      const res = await POST(makeRequest({ token: "valid-token" }), seg);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe("Email verified successfully");
    });

    it("sets emailVerified timestamp and clears verificationToken", async () => {
      await POST(makeRequest({ token: "valid-token" }), seg);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          emailVerified: expect.any(Date),
          verificationToken: null,
        },
      });
    });
  });
});
