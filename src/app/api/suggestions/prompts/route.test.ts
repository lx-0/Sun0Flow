import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockResolveUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  resolveUser: (...args: unknown[]) => mockResolveUser(...args),
}));

const mockSongFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      findMany: (...args: unknown[]) => mockSongFindMany(...args),
    },
  },
}));

import { GET } from "./route";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(url: string) {
  return new Request(url);
}

const USER_ID = "user-123";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/suggestions/prompts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveUser.mockResolvedValue({ userId: USER_ID, isApiKey: false, isAdmin: false, error: null });
    // Default: no songs from either query
    mockSongFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    const errorResponse = new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
    mockResolveUser.mockResolvedValue({ userId: null, isApiKey: false, isAdmin: false, error: errorResponse });

    const res = await GET(makeRequest("http://localhost/api/suggestions/prompts"));
    expect(res.status).toBe(401);
  });

  it("returns curated defaults when user has no history", async () => {
    mockSongFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest("http://localhost/api/suggestions/prompts"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.suggestions).toHaveLength(5);
    expect(data.suggestions[0].source).toBe("curated");
    expect(data.suggestions[0].stylePrompt).toBeTruthy();
    expect(data.suggestions[0].label).toBeTruthy();
    expect(data.suggestions[0].id).toBeTruthy();
  });

  it("returns personal suggestions when user has high-rated songs", async () => {
    // First call: personal songs; second call: community songs (none)
    mockSongFindMany
      .mockResolvedValueOnce([
        { tags: "pop, upbeat, catchy", isInstrumental: false },
        { tags: "pop, upbeat, catchy", isInstrumental: false },
        { tags: "rock, energetic, guitar", isInstrumental: false },
      ])
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest("http://localhost/api/suggestions/prompts"));
    expect(res.status).toBe(200);

    const data = await res.json();
    const personalSuggestions = data.suggestions.filter(
      (s: { source: string }) => s.source === "personal"
    );
    expect(personalSuggestions.length).toBeGreaterThan(0);
    // Most frequent personal combo should appear first
    expect(personalSuggestions[0].stylePrompt).toBe("pop, upbeat, catchy");
    expect(personalSuggestions[0].source).toBe("personal");
  });

  it("fills with community suggestions when personal data is insufficient", async () => {
    // 1 personal song, 2 community songs
    mockSongFindMany
      .mockResolvedValueOnce([
        { tags: "jazz, smooth, mellow", isInstrumental: false },
      ])
      .mockResolvedValueOnce([
        { tags: "electronic, house, energetic", isInstrumental: false },
        { tags: "electronic, house, energetic", isInstrumental: false },
        { tags: "ambient, nature, relaxing", isInstrumental: true },
      ]);

    const res = await GET(makeRequest("http://localhost/api/suggestions/prompts"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.suggestions).toHaveLength(5);
    const sources = data.suggestions.map((s: { source: string }) => s.source);
    expect(sources).toContain("personal");
    expect(sources).toContain("community");
    expect(sources).toContain("curated");
  });

  it("deduplicates across sources", async () => {
    // Personal and community have the same combo
    mockSongFindMany
      .mockResolvedValueOnce([
        { tags: "pop, upbeat", isInstrumental: false },
      ])
      .mockResolvedValueOnce([
        { tags: "pop, upbeat", isInstrumental: false },
        { tags: "pop, upbeat", isInstrumental: false },
      ]);

    const res = await GET(makeRequest("http://localhost/api/suggestions/prompts"));
    const data = await res.json();

    const combos = data.suggestions.map((s: { stylePrompt: string }) => s.stylePrompt.toLowerCase().trim());
    const uniqueCombos = new Set(combos);
    expect(uniqueCombos.size).toBe(combos.length);
  });

  it("returns at most 5 suggestions", async () => {
    mockSongFindMany
      .mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          tags: `genre-${i}, style-${i}`,
          isInstrumental: false,
        }))
      )
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest("http://localhost/api/suggestions/prompts"));
    const data = await res.json();
    expect(data.suggestions.length).toBeLessThanOrEqual(5);
  });

  it("skips songs with empty or null tags", async () => {
    mockSongFindMany
      .mockResolvedValueOnce([
        { tags: null, isInstrumental: false },
        { tags: "  ", isInstrumental: false },
        { tags: "valid, tags, here", isInstrumental: false },
      ])
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest("http://localhost/api/suggestions/prompts"));
    const data = await res.json();

    const personalSuggestions = data.suggestions.filter(
      (s: { source: string }) => s.source === "personal"
    );
    expect(personalSuggestions).toHaveLength(1);
    expect(personalSuggestions[0].stylePrompt).toBe("valid, tags, here");
  });

  it("returns 500 on unexpected error", async () => {
    mockSongFindMany.mockRejectedValue(new Error("DB failure"));

    const res = await GET(makeRequest("http://localhost/api/suggestions/prompts"));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.code).toBe("INTERNAL_ERROR");
  });
});
