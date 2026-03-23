import { describe, it, expect, vi } from "vitest";
import { subscribe, broadcast } from "./event-bus";

describe("subscribe and broadcast", () => {
  it("calls listener when event is broadcast to user", () => {
    const listener = vi.fn();
    subscribe("user-1", listener);

    broadcast("user-1", { type: "generation_update", data: { status: "ready" } });

    expect(listener).toHaveBeenCalledWith({
      type: "generation_update",
      data: { status: "ready" },
    });
  });

  it("does not call listener for a different user", () => {
    const listener = vi.fn();
    subscribe("user-1", listener);

    broadcast("user-2", { type: "notification", data: { message: "hello" } });

    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribes when the returned function is called", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe("user-3", listener);

    unsubscribe();
    broadcast("user-3", { type: "generation_update", data: {} });

    expect(listener).not.toHaveBeenCalled();
  });

  it("cleans up the user listeners set when last subscriber unsubscribes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe("user-cleanup", listener);
    unsubscribe();

    // Should not throw when broadcasting to empty user
    broadcast("user-cleanup", { type: "generation_update", data: {} });
  });

  it("calls multiple listeners for the same user", () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    subscribe("user-multi", l1);
    subscribe("user-multi", l2);

    broadcast("user-multi", { type: "queue_item_complete", data: { songId: "1" } });

    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
  });

  it("broadcast does nothing when no listeners for user", () => {
    // Should not throw
    broadcast("user-no-listeners", { type: "generation_update", data: {} });
  });

  it("ignores errors from listeners and continues broadcasting to others", () => {
    const badListener = vi.fn().mockImplementation(() => {
      throw new Error("listener error");
    });
    const goodListener = vi.fn();
    subscribe("user-error", badListener);
    subscribe("user-error", goodListener);

    // Should not throw
    broadcast("user-error", { type: "notification", data: {} });

    expect(goodListener).toHaveBeenCalledTimes(1);
  });
});
