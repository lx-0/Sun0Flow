import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { parseSunoWebhookRequest } from "./suno-request";

const mockWarn = vi.fn();

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: (...args: unknown[]) => mockWarn(...args),
  },
}));

describe("parseSunoWebhookRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when secret is missing", async () => {
    const req = new Request("http://localhost/api/webhooks/suno?token=abc", {
      method: "POST",
      body: JSON.stringify({ data: { taskId: "t1", status: "SUCCESS" } }),
      headers: { "content-type": "application/json" },
    }) as NextRequest;

    const result = await parseSunoWebhookRequest(req, { secret: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("returns 401 when token does not match", async () => {
    const req = new Request("http://localhost/api/webhooks/suno?token=wrong", {
      method: "POST",
      body: JSON.stringify({ data: { taskId: "t1", status: "SUCCESS" } }),
      headers: { "content-type": "application/json" },
    }) as NextRequest;

    const result = await parseSunoWebhookRequest(req, { secret: "expected" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/webhooks/suno?token=ok", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    }) as NextRequest;

    const result = await parseSunoWebhookRequest(req, { secret: "ok" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("returns 400 when taskId or status is missing", async () => {
    const req = new Request("http://localhost/api/webhooks/suno?token=ok", {
      method: "POST",
      body: JSON.stringify({ data: { status: "SUCCESS" } }),
      headers: { "content-type": "application/json" },
    }) as NextRequest;

    const result = await parseSunoWebhookRequest(req, { secret: "ok" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("returns parsed taskId and status for valid request", async () => {
    const req = new Request("http://localhost/api/webhooks/suno?token=ok", {
      method: "POST",
      body: JSON.stringify({ data: { taskId: "task-123", status: "SUCCESS" } }),
      headers: { "content-type": "application/json" },
    }) as NextRequest;

    const result = await parseSunoWebhookRequest(req, { secret: "ok" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.taskId).toBe("task-123");
      expect(result.status).toBe("SUCCESS");
      expect(result.payload.data?.taskId).toBe("task-123");
    }
  });
});
