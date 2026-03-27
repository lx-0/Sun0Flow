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
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  acquireRateLimitSlot: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const EXISTING_USER = { id: "user-1", email: "test@example.com" };

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue(EXISTING_USER as never);
  vi.mocked(prisma.user.update).mockClear().mockResolvedValue({} as never);
  vi.mocked(sendPasswordResetEmail).mockClear();
  vi.mocked(acquireRateLimitSlot).mockResolvedValue({ acquired: true, status: { remaining: 2, limit: 3, resetAt: "" } } as never);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  describe("validation", () => {
    it("returns 400 when email is missing", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("anti-enumeration", () => {
    it("returns success even when email does not exist", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await POST(makeRequest({ email: "unknown@example.com" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain("reset link");
    });

    it("returns success when rate limit is exceeded", async () => {
      vi.mocked(acquireRateLimitSlot).mockResolvedValue({ acquired: false, status: { remaining: 0, limit: 3, resetAt: "" } } as never);

      const res = await POST(makeRequest({ email: "test@example.com" }));
      expect(res.status).toBe(200);
    });
  });

  describe("success", () => {
    it("sends reset email and updates user token when user exists", async () => {
      const res = await POST(makeRequest({ email: "test@example.com" }));
      expect(res.status).toBe(200);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: expect.objectContaining({
          resetToken: expect.any(String),
          resetTokenExpiry: expect.any(Date),
        }),
      });

      const storedToken = vi.mocked(prisma.user.update).mock.calls[0][0].data.resetToken as string;
      expect(sendPasswordResetEmail).toHaveBeenCalledWith("test@example.com", storedToken);
    });

    it("sets reset token expiry to ~1 hour from now", async () => {
      const before = Date.now();
      await POST(makeRequest({ email: "test@example.com" }));
      const after = Date.now();

      const updateCall = vi.mocked(prisma.user.update).mock.calls[0][0];
      const expiry = (updateCall.data as { resetTokenExpiry: Date }).resetTokenExpiry.getTime();

      expect(expiry).toBeGreaterThanOrEqual(before + 59 * 60 * 1000);
      expect(expiry).toBeLessThanOrEqual(after + 61 * 60 * 1000);
    });

    it("checks rate limit using the user id", async () => {
      await POST(makeRequest({ email: "test@example.com" }));
      expect(acquireRateLimitSlot).toHaveBeenCalledWith("user-1", "password_reset");
    });
  });
});
