import { describe, expect, it } from "vitest";
import {
  addInstrumentalBody,
  addVocalsBody,
  createVariationBody,
  extendSongBody,
  replaceSectionBody,
} from "@/lib/songs/variations/schemas";

describe("song variation request schemas", () => {
  it("accepts minimal variation creation payload", () => {
    expect(createVariationBody.safeParse({}).success).toBe(true);
    expect(createVariationBody.safeParse({ makeInstrumental: true }).success).toBe(true);
  });

  it("requires prompt for add vocals", () => {
    expect(addVocalsBody.safeParse({ prompt: "add energetic topline" }).success).toBe(true);
    expect(addVocalsBody.safeParse({}).success).toBe(false);
  });

  it("validates replace section range fields presence", () => {
    expect(
      replaceSectionBody.safeParse({
        prompt: "tighten chorus",
        infillStartS: 30,
        infillEndS: 45,
      }).success,
    ).toBe(true);
    expect(replaceSectionBody.safeParse({ prompt: "missing range" }).success).toBe(false);
  });

  it("accepts optional payloads for extend and add instrumental", () => {
    expect(extendSongBody.safeParse({}).success).toBe(true);
    expect(addInstrumentalBody.safeParse({}).success).toBe(true);
  });
});
