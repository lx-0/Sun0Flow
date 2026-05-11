import { describe, it, expect } from "vitest";
import { sanitizeForFilename, detectAudioFormat } from "./download-primitives";

describe("sanitizeForFilename", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(sanitizeForFilename("My Cool Song")).toBe("my-cool-song");
  });

  it("strips special characters", () => {
    expect(sanitizeForFilename("Song!@#$%^&*()Title")).toBe("songtitle");
  });

  it("collapses multiple spaces into single hyphens", () => {
    expect(sanitizeForFilename("a   b   c")).toBe("a-b-c");
  });

  it("uses fallback when title is null", () => {
    expect(sanitizeForFilename(null)).toBe("song");
  });

  it("uses fallback when title is undefined", () => {
    expect(sanitizeForFilename(undefined)).toBe("song");
  });

  it("uses custom fallback", () => {
    expect(sanitizeForFilename(null, "track-1")).toBe("track-1");
  });

  it("uses fallback when title sanitizes to empty string", () => {
    expect(sanitizeForFilename("!@#$%")).toBe("song");
  });

  it("preserves hyphens already in the title", () => {
    expect(sanitizeForFilename("lo-fi beats")).toBe("lo-fi-beats");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeForFilename("  padded  ")).toBe("padded");
  });
});

describe("detectAudioFormat", () => {
  it('returns "wav" for .wav URLs', () => {
    expect(detectAudioFormat("https://cdn.example.com/song.wav")).toBe("wav");
  });

  it('returns "wav" for uppercase .WAV', () => {
    expect(detectAudioFormat("https://cdn.example.com/song.WAV")).toBe("wav");
  });

  it('returns "mp3" for .mp3 URLs', () => {
    expect(detectAudioFormat("https://cdn.example.com/song.mp3")).toBe("mp3");
  });

  it('returns "mp3" for URLs without recognized extension', () => {
    expect(detectAudioFormat("https://cdn.example.com/song")).toBe("mp3");
  });

  it('returns "wav" when .wav appears in the path', () => {
    expect(detectAudioFormat("https://cdn.example.com/audio.wav?token=abc")).toBe("wav");
  });
});
