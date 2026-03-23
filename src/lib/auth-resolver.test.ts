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

vi.mock("@/lib/api-key-auth", () => ({
  resolveApiKeyUser: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { resolveApiKeyUser } from "@/lib/api-key-auth";
import { resolveUser } from "./auth-resolver";

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(resolveApiKeyUser).mockReset();
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
    expect(result.error).toBeNull();
  });

  it("falls back to API key auth when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    vi.mocked(resolveApiKeyUser).mockResolvedValue("api-key-user");

    const result = await resolveUser(makeRequest({ authorization: "Bearer sk-abc123" }));

    expect(result.userId).toBe("api-key-user");
    expect(result.isApiKey).toBe(true);
    expect(result.error).toBeNull();
  });

  it("returns error response when neither session nor API key is valid", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    vi.mocked(resolveApiKeyUser).mockResolvedValue(null);

    const result = await resolveUser(makeRequest());

    expect(result.userId).toBeNull();
    expect(result.isApiKey).toBe(false);
    expect(result.error).toBeDefined();
    // The error should be a 401 response
    expect(result.error?.status).toBe(401);
  });

  it("prefers session over API key when both are present", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "session-user" } } as never);
    vi.mocked(resolveApiKeyUser).mockResolvedValue("api-key-user");

    const result = await resolveUser(makeRequest({ authorization: "Bearer sk-abc123" }));

    expect(result.userId).toBe("session-user");
    expect(result.isApiKey).toBe(false);
    // API key should not have been checked since session succeeded
  });
});
