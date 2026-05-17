import { describe, expect, it } from "vitest";
import { closeSSE, createSSEStream, enqueueSSEComment, enqueueSSEEvent } from "@/lib/sse";

describe("sse helpers", () => {
  it("returns false when enqueue throws", () => {
    const controller = {
      enqueue: () => {
        throw new Error("closed");
      },
      close: () => {},
    } as unknown as ReadableStreamDefaultController;

    expect(enqueueSSEComment(controller, "heartbeat")).toBe(false);
    expect(enqueueSSEEvent(controller, "test", { ok: true })).toBe(false);
  });

  it("closeSSE swallows already-closed errors", () => {
    const controller = {
      enqueue: () => {},
      close: () => {
        throw new Error("already closed");
      },
    } as unknown as ReadableStreamDefaultController;

    expect(() => closeSSE(controller)).not.toThrow();
  });

  it("createSSEStream runs start and abort handlers", async () => {
    const abort = new AbortController();
    let started = false;
    let aborted = false;

    const stream = createSSEStream({
      request: new Request("http://localhost/events", { signal: abort.signal }),
      heartbeatMs: 0,
      onStart() {
        started = true;
      },
      onAbort() {
        aborted = true;
      },
    });

    const reader = stream.getReader();
    const first = await reader.read();
    expect(started).toBe(true);
    expect(first.done).toBe(false);

    abort.abort();
    expect(aborted).toBe(true);
  });

  it("cleans up when start throws", async () => {
    let canceled = false;
    const stream = createSSEStream({
      onStart() {
        throw new Error("bootstrap failed");
      },
      onCancel() {
        canceled = true;
      },
    });

    const reader = stream.getReader();
    // The initial "connected" comment is enqueued before onStart runs, so the
    // first read returns that chunk; the stream errors on the next read.
    await reader.read();
    await expect(reader.read()).rejects.toBeTruthy();
    expect(canceled).toBe(true);
  });
});
