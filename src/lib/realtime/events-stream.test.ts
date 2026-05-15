import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

class FakeDoc extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
}

class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];
  url: string;
  readyState = 0;
  onopen: ((ev: Event) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  closed = false;
  constructor(url: string) {
    super();
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(type: string, data: unknown) {
    this.dispatchEvent(
      new MessageEvent(type, { data: JSON.stringify(data) })
    );
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
}

describe("events-stream", () => {
  let fakeDoc: FakeDoc;
  let stream: typeof import("./events-stream");

  beforeEach(async () => {
    vi.useFakeTimers();
    fakeDoc = new FakeDoc();
    FakeEventSource.instances = [];
    const g = globalThis as unknown as Record<string, unknown>;
    g.document = fakeDoc;
    g.window = {};
    g.EventSource = FakeEventSource;
    vi.resetModules();
    stream = await import("./events-stream");
  });

  afterEach(() => {
    vi.useRealTimers();
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.document;
    delete g.window;
    delete g.EventSource;
  });

  it("opens a single connection for multiple subscribers", () => {
    stream.subscribe("foo", vi.fn());
    stream.subscribe("foo", vi.fn());
    expect(FakeEventSource.instances.length).toBe(1);
  });

  it("fans out one event to all subscribers of that type", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    stream.subscribe("foo", h1);
    stream.subscribe("foo", h2);
    FakeEventSource.instances[0]!.emit("foo", { hello: "world" });
    expect(h1).toHaveBeenCalledWith({ hello: "world" });
    expect(h2).toHaveBeenCalledWith({ hello: "world" });
  });

  it("supports multiple event types on one connection", () => {
    const fooH = vi.fn();
    const barH = vi.fn();
    stream.subscribe("foo", fooH);
    stream.subscribe("bar", barH);
    expect(FakeEventSource.instances.length).toBe(1);
    FakeEventSource.instances[0]!.emit("foo", { a: 1 });
    FakeEventSource.instances[0]!.emit("bar", { b: 2 });
    expect(fooH).toHaveBeenCalledWith({ a: 1 });
    expect(barH).toHaveBeenCalledWith({ b: 2 });
  });

  it("closes the connection when the last subscriber unsubscribes", () => {
    const unsub = stream.subscribe("foo", vi.fn());
    const es = FakeEventSource.instances[0]!;
    expect(es.closed).toBe(false);
    unsub();
    expect(es.closed).toBe(true);
  });

  it("does not open a connection while hidden", () => {
    fakeDoc.visibilityState = "hidden";
    stream.subscribe("foo", vi.fn());
    expect(FakeEventSource.instances.length).toBe(0);
  });

  it("closes on hide and reopens on show", () => {
    stream.subscribe("foo", vi.fn());
    expect(FakeEventSource.instances.length).toBe(1);

    fakeDoc.visibilityState = "hidden";
    fakeDoc.dispatchEvent(new Event("visibilitychange"));
    expect(FakeEventSource.instances[0]!.closed).toBe(true);

    fakeDoc.visibilityState = "visible";
    fakeDoc.dispatchEvent(new Event("visibilitychange"));
    expect(FakeEventSource.instances.length).toBe(2);
    expect(FakeEventSource.instances[1]!.closed).toBe(false);
  });

  it("schedules a backoff reconnect after an error", () => {
    stream.subscribe("foo", vi.fn());
    const first = FakeEventSource.instances[0]!;
    first.fail();
    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances.length).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(FakeEventSource.instances.length).toBe(2);
  });
});
