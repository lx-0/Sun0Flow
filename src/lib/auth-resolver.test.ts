import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("@/lib/api-keys", () => ({
  hashApiKey: vi.fn().mockReturnValue("hashed-key"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
    user: {
      findUnique: vi.fn(),
    },
    adminLog: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUser, requireAdmin, logAdminAction } from "./auth-resolver";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", { headers });
}

describe("resolveUser", () => {
  it("returns userId from session when authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "session-user" } } as never);

    const result = await resolveUser(makeRequest());

    expect(result.userId).toBe("session-user");
    expect(result.isApiKey).toBe(false);
    expect(result.isAdmin).toBe(false);
    expect(result.error).toBeNull();
  });

  it("returns isAdmin=true when session user is admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin-user", isAdmin: true } } as never);

    const result = await resolveUser(makeRequest());

    expect(result.userId).toBe("admin-user");
    expect(result.isAdmin).toBe(true);
    expect(result.error).toBeNull();
  });

  it("falls back to API key auth when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({ id: "key-1", userId: "api-key-user" } as never);

    const result = await resolveUser(makeRequest({ authorization: "Bearer sk-abc123" }));

    expect(result.userId).toBe("api-key-user");
    expect(result.isApiKey).toBe(true);
    expect(result.isAdmin).toBe(false);
    expect(result.error).toBeNull();
  });

  it("updates lastUsedAt on successful API key auth", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({ id: "key-1", userId: "api-key-user" } as never);
    vi.mocked(prisma.apiKey.update).mockResolvedValue(undefined as never);

    await resolveUser(makeRequest({ authorization: "Bearer sk-abc123" }));

    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("returns error response when neither session nor API key is valid", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null);

    const result = await resolveUser(makeRequest());

    expect(result.userId).toBeNull();
    expect(result.isApiKey).toBe(false);
    expect(result.isAdmin).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.status).toBe(401);
  });

  it("ignores non-sk Bearer tokens for API key auth", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await resolveUser(makeRequest({ authorization: "Bearer jwt-token-here" }));

    expect(result.userId).toBeNull();
    expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
  });

  it("prefers session over API key when both are present", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "session-user" } } as never);

    const result = await resolveUser(makeRequest({ authorization: "Bearer sk-abc123" }));

    expect(result.userId).toBe("session-user");
    expect(result.isApiKey).toBe(false);
    expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
  });
});

describe("requireAdmin", () => {
  it("returns 401 when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await requireAdmin();

    expect(result.error).not.toBeNull();
    expect(result.error?.status).toBe(401);
    expect(result.session).toBeNull();
    expect(result.user).toBeNull();
  });

  it("returns 403 when user is not admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1", isAdmin: false } as never);

    const result = await requireAdmin();

    expect(result.error).not.toBeNull();
    expect(result.error?.status).toBe(403);
  });

  it("returns session and user when admin", async () => {
    const session = { user: { id: "admin-1" } };
    vi.mocked(auth).mockResolvedValue(session as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "admin-1", isAdmin: true } as never);

    const result = await requireAdmin();

    expect(result.error).toBeNull();
    expect(result.session).toBe(session);
    expect(result.user).toEqual({ id: "admin-1", isAdmin: true });
  });
});

describe("logAdminAction", () => {
  it("creates an admin log entry", async () => {
    await logAdminAction("admin-1", "disable_user", "user-2", "Violated TOS");

    expect(prisma.adminLog.create).toHaveBeenCalledWith({
      data: {
        adminId: "admin-1",
        action: "disable_user",
        targetId: "user-2",
        details: "Violated TOS",
      },
    });
  });
});
