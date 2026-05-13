import { describe, expect, it } from "vitest";
import {
  generateSongRequestSchema,
  sanitizeGenerateSongRequest,
} from "./request";

describe("generateSongRequestSchema", () => {
  it("requires a non-empty prompt", () => {
    const result = generateSongRequestSchema.safeParse({ prompt: "   " });
    expect(result.success).toBe(false);
  });

  it("accepts optional generation fields", () => {
    const result = generateSongRequestSchema.safeParse({
      prompt: "upbeat synth pop",
      title: "Neon Dreams",
      tags: "synth,pop",
      makeInstrumental: true,
      personaId: "persona_1",
      parentSongId: "song_1",
    });
    expect(result.success).toBe(true);
  });
});

describe("sanitizeGenerateSongRequest", () => {
  it("strips HTML, trims text, and normalizes optional fields", () => {
    const sanitized = sanitizeGenerateSongRequest({
      prompt: " <b>upbeat synth pop</b> ",
      title: "  <i>Neon Dreams</i>  ",
      tags: "  <script>x</script>synth,pop  ",
      makeInstrumental: false,
      personaId: "",
      parentSongId: "",
    });

    expect(sanitized).toEqual({
      prompt: "upbeat synth pop",
      title: "Neon Dreams",
      style: "xsynth,pop",
      instrumental: false,
      personaId: undefined,
      parentSongId: undefined,
    });
  });
});
