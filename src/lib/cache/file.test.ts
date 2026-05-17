import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("audioCache.getStream", () => {
  let tmpDir: string;
  const fixtureContent = Buffer.from("0123456789ABCDEFGHIJ"); // 20 bytes

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sunoflow-cache-test-"));
    process.env.AUDIO_CACHE_DIR = tmpDir;
    writeFileSync(join(tmpDir, "song1.mp3"), fixtureContent);
    // The cache module captures AUDIO_CACHE_DIR at load time, so force a
    // fresh import per test to pick up our temp dir.
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.AUDIO_CACHE_DIR;
  });

  async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const total = chunks.reduce((s, c) => s + c.byteLength, 0);
    const out = Buffer.alloc(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    return out;
  }

  it("returns null when the file is missing", async () => {
    const { audioCache } = await import("./file");
    expect(audioCache.getStream("missing")).toBeNull();
  });

  it("streams the full file when no range is given", async () => {
    const { audioCache } = await import("./file");
    const result = audioCache.getStream("song1");
    expect(result).not.toBeNull();
    expect(result!.size).toBe(20);
    expect(result!.contentType).toBe("audio/mpeg");
    const buf = await streamToBuffer(result!.stream);
    expect(buf.toString()).toBe("0123456789ABCDEFGHIJ");
  });

  it("streams the requested byte range only", async () => {
    const { audioCache } = await import("./file");
    const result = audioCache.getStream("song1", 5, 9);
    expect(result).not.toBeNull();
    expect(result!.size).toBe(20); // full-file size reported
    const buf = await streamToBuffer(result!.stream);
    expect(buf.toString()).toBe("56789"); // 5 bytes from offset 5
  });
});
