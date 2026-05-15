import { prisma } from "@/lib/prisma";
import { audioCache } from "@/lib/cache";
import { embedId3Tags, embedWavMetadata } from "@/lib/audio-metadata";
import { wavToFlac } from "@/lib/flac-encoder";
import { sanitizeForFilename, detectAudioFormat } from "@/lib/download-primitives";
import type { SongMetadata } from "@/lib/audio-metadata";

export type DownloadFormat = "mp3" | "wav" | "flac";

export interface DownloadSong {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  tags: string | null;
  prompt: string | null;
  createdAt: Date;
}

export interface DownloadRequest {
  song: DownloadSong;
  artistName: string;
  requestedFormat: DownloadFormat | "native";
  embedMetadata: boolean;
}

export type DownloadResult =
  | { ok: true; buffer: ArrayBuffer; contentType: string; filename: string }
  | { ok: false; error: string; code: string; status: number };

function resolveFormat(
  requestedFormat: DownloadFormat | "native",
  sourceExt: "mp3" | "wav",
): DownloadResult | DownloadFormat {
  if (requestedFormat === "native" || requestedFormat === sourceExt) {
    return sourceExt;
  }

  if (requestedFormat === "flac") {
    if (sourceExt !== "wav") {
      return {
        ok: false,
        error: "FLAC export requires a WAV source. Convert this song to WAV first.",
        code: "FORMAT_UNAVAILABLE",
        status: 422,
      };
    }
    return "flac";
  }

  if (requestedFormat === "wav") {
    if (sourceExt !== "wav") {
      return {
        ok: false,
        error: "WAV export not available. Convert this song to WAV first.",
        code: "FORMAT_UNAVAILABLE",
        status: 422,
      };
    }
    return "wav";
  }

  return sourceExt;
}

async function fetchAudioBuffer(
  songId: string,
  audioUrl: string,
): Promise<ArrayBuffer | null> {
  const cached = audioCache.get(songId)?.data ?? null;
  if (cached) {
    return cached.buffer.slice(
      cached.byteOffset,
      cached.byteOffset + cached.byteLength,
    ) as ArrayBuffer;
  }

  const upstream = await fetch(audioUrl);
  if (!upstream.ok) return null;
  return upstream.arrayBuffer();
}

async function fetchCoverArt(
  imageUrl: string,
): Promise<SongMetadata["coverArt"]> {
  try {
    if (imageUrl.startsWith("data:image/")) {
      const commaIdx = imageUrl.indexOf(",");
      if (commaIdx === -1) return null;
      const mimeMatch = imageUrl.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch?.[1] ?? "image/jpeg";
      const b64 = imageUrl.slice(commaIdx + 1);
      const binary = Buffer.from(b64, "base64");
      return { data: new Uint8Array(binary), mimeType };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const imgRes = await fetch(imageUrl, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!imgRes.ok) return null;

    const ct = imgRes.headers.get("content-type") ?? "image/jpeg";
    const mimeType = ct.split(";")[0].trim();
    if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") {
      return null;
    }
    const imgBuf = await imgRes.arrayBuffer();
    return { data: new Uint8Array(imgBuf), mimeType };
  } catch {
    return null;
  }
}


function contentTypeFor(format: DownloadFormat): {
  contentType: string;
  fileExt: string;
} {
  switch (format) {
    case "flac":
      return { contentType: "audio/flac", fileExt: "flac" };
    case "wav":
      return { contentType: "audio/wav", fileExt: "wav" };
    case "mp3":
      return { contentType: "audio/mpeg", fileExt: "mp3" };
  }
}

export async function prepareSongDownload(
  req: DownloadRequest,
): Promise<DownloadResult> {
  const { song, artistName, requestedFormat, embedMetadata } = req;

  if (!song.audioUrl) {
    return { ok: false, error: "No audio available", code: "NOT_FOUND", status: 404 };
  }

  const sourceExt = detectAudioFormat(song.audioUrl);

  const formatResult = resolveFormat(requestedFormat, sourceExt);
  if (typeof formatResult !== "string") return formatResult;
  const targetFormat = formatResult;

  let audioBuffer = await fetchAudioBuffer(song.id, song.audioUrl);
  if (!audioBuffer) {
    return {
      ok: false,
      error: "Failed to fetch audio from source",
      code: "INTERNAL_ERROR",
      status: 502,
    };
  }

  // Fire-and-forget download count increment
  prisma.song
    .update({ where: { id: song.id }, data: { downloadCount: { increment: 1 } } })
    .catch(() => {});

  // Format conversion
  if (targetFormat === "flac") {
    const flacBuffer = wavToFlac(new Uint8Array(audioBuffer));
    if (!flacBuffer) {
      return {
        ok: false,
        error: "FLAC conversion failed — unsupported WAV format",
        code: "CONVERSION_ERROR",
        status: 422,
      };
    }
    audioBuffer = flacBuffer.buffer as ArrayBuffer;
  }

  // Metadata embedding (MP3 and WAV only; FLAC would require Vorbis comments)
  if (embedMetadata && targetFormat !== "flac") {
    let coverArt: SongMetadata["coverArt"] = null;
    if (song.imageUrl && targetFormat === "mp3") {
      coverArt = await fetchCoverArt(song.imageUrl);
    }

    const meta: SongMetadata = {
      title: song.title ?? undefined,
      artist: artistName,
      album: "SunoFlow",
      year: new Date(song.createdAt).getFullYear(),
      genre: song.tags ?? undefined,
      comment: song.prompt ?? undefined,
      coverArt,
    };

    const audioBytes = new Uint8Array(audioBuffer);
    const tagged =
      targetFormat === "wav"
        ? embedWavMetadata(audioBytes, meta)
        : embedId3Tags(audioBytes, meta);
    audioBuffer = tagged.buffer as ArrayBuffer;
  }

  const titleSlug = sanitizeForFilename(song.title);
  const { contentType, fileExt } = contentTypeFor(targetFormat);

  return {
    ok: true,
    buffer: audioBuffer,
    contentType,
    filename: `${titleSlug}.${fileExt}`,
  };
}
