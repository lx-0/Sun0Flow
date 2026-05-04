import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

export interface CachedFile {
  data: Buffer;
  contentType: string;
}

interface FileCacheConfig {
  envVar: string;
  defaultSubdir: string;
  extensions: string[];
  contentTypes: Record<string, string>;
}

export interface FileCache {
  get(id: string): CachedFile | null;
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
      const p = findFile(id);
      if (!p) return null;
      const ext = p.slice(p.lastIndexOf("."));
      return {
        data: readFileSync(p),
        contentType: config.contentTypes[ext] ?? "application/octet-stream",
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
        writeFileSync(join(cacheDir, `${safeName(id)}${ext}`), data);
      } catch {
        // Non-fatal — worst case we fetch again next time
      }
    },

    has(id) {
      return findFile(id) !== null;
    },

    async downloadAndPut(id, url) {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const contentType = res.headers.get("content-type") ?? undefined;
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        cache.put(id, buf, contentType);
        return buf;
      } catch {
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
