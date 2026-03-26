import { describe, it, expect } from "vitest";
import { generateCoverArtVariants } from "./cover-art-generator";

describe("generateCoverArtVariants", () => {
  it("returns exactly 3 variants", () => {
    const variants = generateCoverArtVariants({ songId: "test-song-1" });
    expect(variants).toHaveLength(3);
  });

  it("returns abstract, illustrated, and photographic styles", () => {
    const variants = generateCoverArtVariants({ songId: "test-song-1" });
    const styles = variants.map((v) => v.style);
    expect(styles).toContain("abstract");
    expect(styles).toContain("illustrated");
    expect(styles).toContain("photographic");
  });

  it("produces SVG data URIs", () => {
    const variants = generateCoverArtVariants({ songId: "test-song-1" });
    for (const v of variants) {
      expect(v.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    }
  });

  it("is deterministic — same input always produces same output", () => {
    const first = generateCoverArtVariants({ songId: "stable-id", title: "My Song", tags: "pop" });
    const second = generateCoverArtVariants({ songId: "stable-id", title: "My Song", tags: "pop" });
    expect(first[0].dataUrl).toBe(second[0].dataUrl);
    expect(first[1].dataUrl).toBe(second[1].dataUrl);
    expect(first[2].dataUrl).toBe(second[2].dataUrl);
  });

  it("produces distinct outputs for different song IDs", () => {
    const a = generateCoverArtVariants({ songId: "song-aaa" });
    const b = generateCoverArtVariants({ songId: "song-bbb" });
    expect(a[0].dataUrl).not.toBe(b[0].dataUrl);
  });

  it("handles missing title and tags gracefully", () => {
    expect(() => generateCoverArtVariants({ songId: "no-meta" })).not.toThrow();
    const variants = generateCoverArtVariants({ songId: "no-meta" });
    expect(variants).toHaveLength(3);
  });

  it("each variant has a non-empty label and prompt", () => {
    const variants = generateCoverArtVariants({ songId: "test-song-2", title: "Rock Night", tags: "rock, electric" });
    for (const v of variants) {
      expect(v.label).toBeTruthy();
      expect(v.prompt).toBeTruthy();
    }
  });

  it("data URI decodes to valid SVG", () => {
    const [variant] = generateCoverArtVariants({ songId: "svg-check" });
    const base64 = variant.dataUrl.replace("data:image/svg+xml;base64,", "");
    const svg = Buffer.from(base64, "base64").toString("utf-8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });
});
