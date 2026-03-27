import { describe, it, expect, vi, beforeEach } from "vitest";
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

const mockAnonFindMany = vi.fn().mockResolvedValue([]);
const mockAnonCreate = vi.fn().mockResolvedValue({ id: "rl-1" });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    anonRateLimitEntry: {
      findMany: (...args: unknown[]) => mockAnonFindMany(...args),
      create: (...args: unknown[]) => mockAnonCreate(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        anonRateLimitEntry: {
          findMany: (...args: unknown[]) => mockAnonFindMany(...args),
          create: (...args: unknown[]) => mockAnonCreate(...args),
        },
      }),
  },
}));

vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
  },
}));

import { prisma } from "@/lib/prisma";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.create).mockResolvedValue({
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
  } as never);
});

describe("POST /api/register", () => {
  it("creates a user successfully", async () => {
    const res = await POST(makeRequest({
      email: "test@example.com",
      password: "password123",
      name: "Test User",
    }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.email).toBe("test@example.com");
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({ password: "password123" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makeRequest({ email: "test@example.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const res = await POST(makeRequest({ email: "test@example.com", password: "short" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is too long", async () => {
    const res = await POST(makeRequest({ email: "test@example.com", password: "p".repeat(129) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is too long", async () => {
    const res = await POST(makeRequest({ email: "a".repeat(256) + "@example.com", password: "password123" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when email already exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);

    const res = await POST(makeRequest({ email: "existing@example.com", password: "password123" }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("CONFLICT");
  });

  it("returns 400 when name is too long", async () => {
    const res = await POST(makeRequest({
      email: "test@example.com",
      password: "password123",
      name: "n".repeat(101),
    }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/register — malformed input and XSS edge cases", () => {
  it("returns 500 when request body is malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json ;;; }",
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.code).toBe("INTERNAL_ERROR");
    // Must not expose internal error message
    expect(data.error).not.toContain("SyntaxError");
  });

  it("returns 500 when request body is completely empty", async () => {
    const req = new NextRequest("http://localhost/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("sanitizes XSS in name field and creates user successfully", async () => {
    const res = await POST(makeRequest({
      email: "xss-test@example.com",
      password: "password123",
      name: '<script>alert("xss")</script>Alice',
    }));

    expect(res.status).toBe(201);
    // Confirm the user was created with a sanitized name (no HTML tags)
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: expect.not.stringContaining("<script>"),
        }),
      })
    );
  });

  it("returns consistent error format (error + code) for all 4xx responses", async () => {
    const res = await POST(makeRequest({ password: "password123" })); // missing email
    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(data).toHaveProperty("code");
    expect(typeof data.error).toBe("string");
    expect(typeof data.code).toBe("string");
  });
});
