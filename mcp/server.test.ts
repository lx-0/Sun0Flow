import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock env and prisma before importing mcp modules
vi.mock("@/lib/env", () => ({
  get DATABASE_URL() {
    return "postgres://test:test@localhost:5432/test";
  },
  get AUTH_SECRET() {
    return "test-secret";
  },
  get NEXTAUTH_URL() {
    return "http://localhost:3000";
  },
  get SUNOAPI_KEY() {
    return "test-key";
  },
  get SUNO_API_TIMEOUT_MS() {
    return 30000;
  },
  get RATE_LIMIT_MAX_GENERATIONS() {
    return 10;
  },
  env: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { resolveApiKeyFromEnv } from "./auth";
import { registerTool, getTools, getTool, _resetRegistry } from "./registry";

// ─── Registry tests ───────────────────────────────────────────────────────────

describe("tool registry", () => {
  beforeEach(() => {
    _resetRegistry();
  });

  it("starts empty", () => {
    expect(getTools()).toHaveLength(0);
  });

  it("registers a tool and retrieves it by name", () => {
    registerTool({
      name: "my_tool",
      description: "Does something",
      inputSchema: { type: "object", properties: {} },
      handler: async () => ({}),
    });

    expect(getTools()).toHaveLength(1);
    expect(getTool("my_tool")?.name).toBe("my_tool");
  });

  it("overwrites a tool registered with the same name", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    registerTool({
      name: "dup",
      description: "First",
      inputSchema: {},
      handler: handler1,
    });
    registerTool({
      name: "dup",
      description: "Second",
      inputSchema: {},
      handler: handler2,
    });

    expect(getTools()).toHaveLength(1);
    expect(getTool("dup")?.description).toBe("Second");
  });

  it("returns undefined for unknown tool name", () => {
    expect(getTool("does_not_exist")).toBeUndefined();
  });
});

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe("resolveApiKeyFromEnv", () => {
  const originalEnv = process.env.SUNOFLOW_API_KEY;

  beforeEach(() => {
    vi.mocked(prisma.apiKey.findFirst).mockReset();
    vi.mocked(prisma.apiKey.update).mockResolvedValue({} as never);
    delete process.env.SUNOFLOW_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SUNOFLOW_API_KEY = originalEnv;
    } else {
      delete process.env.SUNOFLOW_API_KEY;
    }
  });

  it("returns null when SUNOFLOW_API_KEY is not set", async () => {
    const result = await resolveApiKeyFromEnv();
    expect(result).toBeNull();
    expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when key does not start with sk-", async () => {
    process.env.SUNOFLOW_API_KEY = "invalid-key";
    const result = await resolveApiKeyFromEnv();
    expect(result).toBeNull();
    expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when key is not found in DB", async () => {
    process.env.SUNOFLOW_API_KEY = "sk-testkey";
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null);

    const result = await resolveApiKeyFromEnv();
    expect(result).toBeNull();
  });

  it("returns userId when key is valid", async () => {
    process.env.SUNOFLOW_API_KEY = "sk-validkey";
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-1",
      userId: "user-abc",
    } as never);

    const result = await resolveApiKeyFromEnv();
    expect(result).toBe("user-abc");
  });

  it("hashes the key before querying (does not pass raw key to DB)", async () => {
    process.env.SUNOFLOW_API_KEY = "sk-secret";
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-1",
      userId: "user-xyz",
    } as never);

    await resolveApiKeyFromEnv();

    const call = vi.mocked(prisma.apiKey.findFirst).mock.calls[0][0] as {
      where: { keyHash: string; revokedAt: null };
    };
    expect(call.where.keyHash).not.toBe("sk-secret");
    expect(call.where.keyHash).toHaveLength(64); // SHA-256 hex
    expect(call.where.revokedAt).toBeNull();
  });

  it("fires lastUsedAt update without blocking", async () => {
    process.env.SUNOFLOW_API_KEY = "sk-fire";
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: "key-fire",
      userId: "user-fire",
    } as never);

    const result = await resolveApiKeyFromEnv();
    expect(result).toBe("user-fire");
    // update is called (fire-and-forget, not awaited by the caller)
    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: "key-fire" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });
});
