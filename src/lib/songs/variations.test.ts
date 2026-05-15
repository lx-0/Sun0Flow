import { describe, it, expect } from "vitest";
import { normalizeVariationTags, variationTitle, MAX_VARIATIONS } from "./variations";

describe("normalizeVariationTags", () => {
  it("returns 'remix' for empty string", () => {
    expect(normalizeVariationTags("")).toBe("remix");
  });

  it("appends remix when not present", () => {
    expect(normalizeVariationTags("jazz, chill")).toBe("jazz, chill, remix");
  });

  it("preserves tags when remix already present", () => {
    expect(normalizeVariationTags("jazz, remix, chill")).toBe("jazz, remix, chill");
  });

  it("detects remix case-insensitively", () => {
    expect(normalizeVariationTags("jazz, Remix")).toBe("jazz, Remix");
  });

  it("detects remix as substring", () => {
    expect(normalizeVariationTags("remix-style")).toBe("remix-style");
  });
});

describe("variationTitle", () => {
  it("returns explicit title when provided", () => {
    expect(variationTitle("Original", "My Remix")).toBe("My Remix");
  });

  it("trims explicit title", () => {
    expect(variationTitle("Original", "  My Remix  ")).toBe("My Remix");
  });

  it("falls back to parent title with suffix", () => {
    expect(variationTitle("Cool Song")).toBe("Cool Song (variation)");
  });

  it("returns null when no parent title and no explicit title", () => {
    expect(variationTitle(null)).toBeNull();
  });

  it("ignores whitespace-only explicit title", () => {
    expect(variationTitle("Original", "   ")).toBe("Original (variation)");
  });

  it("ignores empty explicit title", () => {
    expect(variationTitle("Original", "")).toBe("Original (variation)");
  });
});

describe("MAX_VARIATIONS", () => {
  it("is 5", () => {
    expect(MAX_VARIATIONS).toBe(5);
  });
});
