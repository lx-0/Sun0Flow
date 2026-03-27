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

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
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
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/email";

const UNVERIFIED_USER = { id: "user-1", email: "test@example.com", emailVerified: null };
const VERIFIED_USER = { id: "user-1", email: "test@example.com", emailVerified: new Date("2025-01-01") };

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(UNVERIFIED_USER as never);
  vi.mocked(prisma.user.update).mockClear().mockResolvedValue({} as never);
  vi.mocked(sendVerificationEmail).mockClear();
  vi.mocked(acquireRateLimitSlot).mockResolvedValue({ acquired: true, status: { remaining: 2, limit: 3, resetAt: "" } } as never);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/auth/resend-verification", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const res = await POST();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 when session has no user id", async () => {
      vi.mocked(auth).mockResolvedValue({ user: {} } as never);

      const res = await POST();
      expect(res.status).toBe(401);
    });
  });

  describe("user lookup", () => {
    it("returns 404 when user record is not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await POST();
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("NOT_FOUND");
    });

    it("returns 404 when user has no email", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", email: null, emailVerified: null } as never);

      const res = await POST();
      expect(res.status).toBe(404);
    });
  });

  describe("already verified", () => {
    it("returns 200 with 'already verified' message", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(VERIFIED_USER as never);

      const res = await POST();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain("already verified");
    });

    it("does not send an email when already verified", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(VERIFIED_USER as never);

      await POST();
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      vi.mocked(acquireRateLimitSlot).mockResolvedValue({ acquired: false, status: { remaining: 0, limit: 3, resetAt: "" } } as never);

      const res = await POST();
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.code).toBe("RATE_LIMIT");
    });

    it("checks rate limit using user id and 'verification_email' action", async () => {
      await POST();
      expect(acquireRateLimitSlot).toHaveBeenCalledWith("user-1", "verification_email");
    });
  });

  describe("success", () => {
    it("returns 200 with success message", async () => {
      const res = await POST();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe("Verification email sent");
    });

    it("updates user with a new verification token", async () => {
      await POST();

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { verificationToken: expect.any(String) },
      });
    });

    it("sends verification email with the same token stored in the database", async () => {
      await POST();

      const storedToken = vi.mocked(prisma.user.update).mock.calls[0][0].data.verificationToken as string;
      expect(sendVerificationEmail).toHaveBeenCalledWith("test@example.com", storedToken);
    });
  });
});
