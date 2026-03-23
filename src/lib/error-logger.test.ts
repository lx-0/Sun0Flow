import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logServerError, logError } from "./error-logger";

describe("logServerError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a correlation ID string", () => {
    const id = logServerError("test-source", new Error("oops"), { route: "/api/test" });
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("logs to console.error", () => {
    logServerError("test-source", new Error("test error"), {
      route: "/api/songs",
      userId: "user-1",
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("uses provided correlationId", () => {
    const id = logServerError("src", new Error("err"), {
      route: "/api/x",
      correlationId: "my-fixed-id",
    });
    expect(id).toBe("my-fixed-id");
  });

  it("handles non-Error objects", () => {
    const id = logServerError("src", "string error", { route: "/api/x" });
    expect(typeof id).toBe("string");
    expect(console.error).toHaveBeenCalled();
  });

  it("handles null/undefined errors", () => {
    const id = logServerError("src", null, { route: "/api/x" });
    expect(typeof id).toBe("string");
  });

  it("includes params in log", () => {
    logServerError("src", new Error("err"), {
      route: "/api/generate",
      params: { prompt: "test" },
    });
    const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0];
    const logged = call[1];
    expect(logged).toContain("prompt");
  });
});

describe("logError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs an error to console", () => {
    logError("component", new Error("client error"));
    expect(console.error).toHaveBeenCalled();
  });

  it("handles non-Error objects", () => {
    logError("component", "plain string error");
    expect(console.error).toHaveBeenCalled();
  });

  it("accepts optional route", () => {
    logError("component", new Error("err"), "/dashboard");
    expect(console.error).toHaveBeenCalled();
  });
});
