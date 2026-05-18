import { describe, expect, it } from "vitest";
import { webhookAck } from "./ack";

describe("webhookAck", () => {
  it("returns received=true by default", async () => {
    const res = webhookAck();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });

  it("includes duplicate=true when duplicate option is set", async () => {
    const res = webhookAck({ duplicate: true });
    await expect(res.json()).resolves.toEqual({ received: true, duplicate: true });
  });

  it("includes matched=false when matched option is false", async () => {
    const res = webhookAck({ matched: false });
    await expect(res.json()).resolves.toEqual({ received: true, matched: false });
  });
});
