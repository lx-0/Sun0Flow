import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, createReadStream, promises as fsp } from "fs";
import { join } from "path";

// Convert a Node Readable stream to a Web ReadableStream WITHOUT importing
// `node:stream` (which webpack's edge target cannot resolve, breaking the
// build via instrumentation.ts → @/lib/cache/warmup → here). Re-implements
// the small subset of stream.Readable.toWeb() we actually need.
type NodeReadable = NodeJS.ReadableStream;
function nodeStreamToWeb(node: NodeReadable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      node.on("data", (chunk: Buffer | string) => {
        const u8 =
          typeof chunk === "string"
            ? new TextEncoder().encode(chunk)
            : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        controller.enqueue(u8);
      });
      node.on("end", () => controller.close());
      node.on("error", (err) => controller.error(err));
    },
    cancel() {
      // best-effort — destroy if the underlying stream supports it
      const destroyable = node as { destroy?: (err?: Error) => void };
      destroyable.destroy?.();
    },
  });
}
import { logger } from "@/lib/logger";

export interface CachedFile {
  data: Buffer;
  contentType: string;
}

export interface CachedStream {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}

interface FileCacheConfig {
  envVar: string;
  defaultSubdir: string;
  extensions: string[];
  contentTypes: Record<string, string>;
}

export interface FileCache {
  get(id: string): CachedFile | null;
  /**
   * Stream the cached file (optionally a byte range) without buffering the
   * whole content into memory or blocking the Node.js event loop. Use this
   * for audio/video range responses — `get` reads the full file with
   * `readFileSync` and is unsuitable for hot paths.
   *
   * Returns null when the file is absent. Returns size of the FULL file
   * (not the slice) so callers can build Content-Range correctly.
   */
  getStream(id: string, start?: number, end?: number): CachedStream | null;
  getSize(id: string): number | null;
  put(id: string, data: Buffer, contentType?: string): void;
  has(id: string): boolean;
  downloadAndPut(id: string, url: string): Promise<Buffer | null>;
  count(): number;
}

function createFileCache(config: FileCacheConfig): FileCache {
  const cacheDir = process.env[config.envVar] || join(process.cwd(), config.defaultSubdir);
  let dirReady = false;

  function ensureDir() {
    if (dirReady) return;
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    dirReady = true;
  }

  function safeName(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function findFile(id: string): string | null {
    const safe = safeName(id);
    for (const ext of config.extensions) {
      const p = join(cacheDir, `${safe}${ext}`);
      if (existsSync(p)) return p;
    }
    return null;
  }

  function contentTypeFor(path: string): string {
    const ext = path.slice(path.lastIndexOf("."));
    return config.contentTypes[ext] ?? "application/octet-stream";
  }

  function resolveExtension(contentType?: string): string {
    if (!contentType) return config.extensions[0];
    for (const [ext, mime] of Object.entries(config.contentTypes)) {
      const subtype = mime.split("/")[1];
      if (contentType.includes(subtype)) return ext;
    }
    return config.extensions[0];
  }

  const cache: FileCache = {
    get(id) {
      // Sync read kept for cold paths (admin tools, tests). Hot paths must
      // use getStream — readFileSync on a 5 MB audio file stalls the event
      // loop and serialises every concurrent request behind it.
      const p = findFile(id);
      if (!p) return null;
      return {
        data: readFileSync(p),
        contentType: contentTypeFor(p),
      };
    },

    getStream(id, start, end) {
      const p = findFile(id);
      if (!p) return null;
      let size: number;
      try {
        size = statSync(p).size;
      } catch {
        return null;
      }
      const nodeStream: NodeReadable = createReadStream(p, {
        start: start ?? 0,
        end: end ?? size - 1,
      });
      return {
        stream: nodeStreamToWeb(nodeStream),
        contentType: contentTypeFor(p),
        size,
      };
    },

    getSize(id) {
      const p = findFile(id);
      if (!p) return null;
      return statSync(p).size;
    },

    put(id, data, contentType?) {
      try {
        ensureDir();
        const ext = resolveExtension(contentType);
        const fp = join(cacheDir, `${safeName(id)}${ext}`);
        // Fire-and-forget async write — keeps the call sync for existing
        // callers but avoids blocking the event loop on a multi-MB flush.
        // Errors are logged; no caller reads the file back synchronously
        // after put, so the brief delay is tolerable.
        fsp.writeFile(fp, data).catch((err) => {
          logger.warn({ id, cacheDir, err }, "file-cache: put failed");
        });
      } catch (err) {
        logger.warn({ id, cacheDir, err }, "file-cache: put setup failed");
      }
    },

    has(id) {
      return findFile(id) !== null;
    },

    async downloadAndPut(id, url) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          logger.warn({ id, url, status: res.status }, "file-cache: download failed");
          return null;
        }
        const contentType = res.headers.get("content-type") ?? undefined;
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        cache.put(id, buf, contentType);
        return buf;
      } catch (err) {
        logger.warn({ id, url, err }, "file-cache: downloadAndPut failed");
        return null;
      }
    },

    count() {
      try {
        ensureDir();
        return readdirSync(cacheDir).filter((f) =>
          config.extensions.some((ext) => f.endsWith(ext))
        ).length;
      } catch {
        return 0;
      }
    },
  };

  return cache;
}

export const audioCache = createFileCache({
  envVar: "AUDIO_CACHE_DIR",
  defaultSubdir: ".audio-cache",
  extensions: [".mp3"],
  contentTypes: { ".mp3": "audio/mpeg" },
});

export const imageCache = createFileCache({
  envVar: "IMAGE_CACHE_DIR",
  defaultSubdir: ".image-cache",
  extensions: [".jpg", ".png", ".webp"],
  contentTypes: { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" },
});
