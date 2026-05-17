import { describe, expect, it } from "vitest";
import { extractErrorInfo } from "./extract";

describe("extractErrorInfo", () => {
  it("returns Error message + stack for Error instances", () => {
    const err = new Error("boom");
    const result = extractErrorInfo(err);
    expect(result.message).toBe("boom");
    expect(result.stack).toContain("Error: boom");
  });

  it("falls back to Unknown error for nullish payloads", () => {
    expect(extractErrorInfo(undefined).message).toBe("Unknown error");
    expect(extractErrorInfo(null).message).toBe("Unknown error");
  });

  it("extracts message from object payloads", () => {
    const result = extractErrorInfo({ message: "object boom", stack: "line1\nline2" });
    expect(result.message).toBe("object boom");
    expect(result.stack).toBe("line1\nline2");
  });

  it("extracts reason when message is unavailable", () => {
    const result = extractErrorInfo({ reason: "promise rejected" });
    expect(result.message).toBe("promise rejected");
  });
});
