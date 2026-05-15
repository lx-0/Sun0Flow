import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

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

vi.mock("@/lib/comments", () => ({
  listComments: vi.fn(),
  createComment: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { listComments } from "@/lib/comments";

const seg = { params: Promise.resolve({ id: "song-1" }) };

function makeRequest(url: string) {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(listComments).mockResolvedValue({
    ok: true,
    data: {
      comments: [],
      pagination: { page: 1, totalPages: 0, total: 0, hasMore: false },
    },
  });
});

describe("/api/songs/[id]/comments", () => {
  it("GET allows unauthenticated access", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
    });

    const res = await GET(makeRequest("http://localhost/api/songs/song-1/comments?page=1"), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(listComments).toHaveBeenCalledWith("song-1", 1);
    expect(data.comments).toEqual([]);
  });

  it("POST still requires authentication", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
    });

    const res = await POST(
      new NextRequest("http://localhost/api/songs/song-1/comments", {
        method: "POST",
        body: JSON.stringify({ body: "hello" }),
      }),
      seg,
    );

    expect(res.status).toBe(401);
  });
});
