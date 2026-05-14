import { describe, expect, it } from "vitest";
import { isBenignError } from "./GlobalErrorHandler";

describe("isBenignError", () => {
  it("returns true for ResizeObserver loop errors", () => {
    expect(isBenignError(new Error("ResizeObserver loop limit exceeded"))).toBe(true);
  });

  it("returns true for AbortError", () => {
    expect(isBenignError(new DOMException("The operation was aborted.", "AbortError"))).toBe(true);
  });

  it("returns true for interrupted media play requests", () => {
    expect(
      isBenignError(new Error("The play() request was interrupted by a new load request.")),
    ).toBe(true);
  });

  it("returns true for generic cross-origin script errors", () => {
    expect(isBenignError(undefined, "Script error.")).toBe(true);
  });

  it("returns false for actionable errors", () => {
    expect(isBenignError(new Error("TypeError: Cannot read properties of undefined"))).toBe(
      false,
    );
  });
});
