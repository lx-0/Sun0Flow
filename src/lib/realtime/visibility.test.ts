import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

class FakeDoc extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
}

describe("visibility", () => {
  let fakeDoc: FakeDoc;
  let mod: typeof import("./visibility");

  beforeEach(async () => {
    fakeDoc = new FakeDoc();
    (globalThis as unknown as { document: FakeDoc }).document = fakeDoc;
    vi.resetModules();
    mod = await import("./visibility");
  });

  afterEach(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it("reports visible by default", () => {
    expect(mod.getIsVisible()).toBe(true);
  });

  it("reports hidden when visibilityState is hidden", () => {
    fakeDoc.visibilityState = "hidden";
    expect(mod.getIsVisible()).toBe(false);
  });

  it("notifies subscribers on visibilitychange", () => {
    const listener = vi.fn();
    mod.subscribeVisibility(listener);

    fakeDoc.visibilityState = "hidden";
    fakeDoc.dispatchEvent(new Event("visibilitychange"));
    expect(listener).toHaveBeenLastCalledWith(false);

    fakeDoc.visibilityState = "visible";
    fakeDoc.dispatchEvent(new Event("visibilitychange"));
    expect(listener).toHaveBeenLastCalledWith(true);
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsub = mod.subscribeVisibility(listener);
    unsub();
    fakeDoc.visibilityState = "hidden";
    fakeDoc.dispatchEvent(new Event("visibilitychange"));
    expect(listener).not.toHaveBeenCalled();
  });
});
