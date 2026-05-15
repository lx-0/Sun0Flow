import { describe, expect, it } from "vitest";
import { validateSongTransformPrerequisites } from "@/lib/song-transform-guards";

describe("validateSongTransformPrerequisites", () => {
  const baseSong = {
    generationStatus: "ready",
    sunoJobId: "job-1",
    sunoAudioId: "audio-1",
  };

  it("returns validation error when song is not ready", async () => {
    const response = validateSongTransformPrerequisites(
      { ...baseSong, generationStatus: "processing" },
      {
        requireIdentifiers: true,
        notReadyMessage: "Song must be fully generated first.",
        missingIdentifiersMessage: "Missing Suno identifiers.",
      },
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      error: "Song must be fully generated first.",
      code: "VALIDATION_ERROR",
    });
  });

  it("returns validation error when identifiers are required and missing", async () => {
    const response = validateSongTransformPrerequisites(
      { ...baseSong, sunoJobId: null },
      {
        requireIdentifiers: true,
        notReadyMessage: "Song must be fully generated first.",
        missingIdentifiersMessage: "Missing Suno identifiers.",
      },
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      error: "Missing Suno identifiers.",
      code: "VALIDATION_ERROR",
    });
  });

  it("passes when identifiers are missing but not required", () => {
    const response = validateSongTransformPrerequisites(
      { ...baseSong, sunoJobId: null, sunoAudioId: null },
      {
        requireIdentifiers: false,
        notReadyMessage: "Song must be fully generated first.",
        missingIdentifiersMessage: "Missing Suno identifiers.",
      },
    );

    expect(response).toBeNull();
  });

  it("passes when song is ready and identifiers are present", () => {
    const response = validateSongTransformPrerequisites(baseSong, {
      requireIdentifiers: true,
      notReadyMessage: "Song must be fully generated first.",
      missingIdentifiersMessage: "Missing Suno identifiers.",
    });

    expect(response).toBeNull();
  });
});
