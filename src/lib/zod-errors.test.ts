import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatZodIssues } from "@/lib/zod-errors";

describe("formatZodIssues", () => {
  it("includes path prefixes when provided", () => {
    const schema = z.object({ title: z.string().min(3) });
    const result = schema.safeParse({ title: "x" });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(formatZodIssues(result.error.issues)).toContain("title:");
  });

  it("joins multiple issues with semicolons", () => {
    const schema = z.object({
      title: z.string().min(3),
      style: z.string().min(3),
    });
    const result = schema.safeParse({ title: "x", style: "y" });

    expect(result.success).toBe(false);
    if (result.success) return;

    const formatted = formatZodIssues(result.error.issues);
    expect(formatted.includes("; ")).toBe(true);
  });
});
