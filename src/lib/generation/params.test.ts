import { describe, expect, it } from "vitest";
import { validateAndSanitizeBatchGenerationConfigs } from "./params";

describe("validateAndSanitizeBatchGenerationConfigs", () => {
  it("validates and sanitizes a batch", () => {
    const result = validateAndSanitizeBatchGenerationConfigs([
      {
        prompt: "  <b>lofi beat</b> ",
        title: "  <i>Night Drive</i> ",
        style: " <script>x</script>chill ",
        makeInstrumental: true,
      },
      {
        prompt: "energetic house",
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toEqual([
      {
        prompt: "lofi beat",
        title: "Night Drive",
        style: "xchill",
        instrumental: true,
        personaId: undefined,
        parentSongId: undefined,
        model: undefined,
      },
      {
        prompt: "energetic house",
        title: undefined,
        style: undefined,
        instrumental: false,
        personaId: undefined,
        parentSongId: undefined,
        model: undefined,
      },
    ]);
  });

  it("rejects invalid batch sizes", () => {
    const result = validateAndSanitizeBatchGenerationConfigs([{ prompt: "one" }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Batch size must be between");
  });
});
