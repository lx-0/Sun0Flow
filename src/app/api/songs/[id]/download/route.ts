import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { embedId3Tags, embedWavMetadata } from "@/lib/audio-metadata";
import { wavToFlac } from "@/lib/flac-encoder";
import type { SongMetadata } from "@/lib/audio-metadata";
import { audioCache } from "@/lib/cache";

const DOWNLOAD_RATE_LIMIT = 50; // per hour

type DownloadFormat = "mp3" | "wav" | "flac";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { id: songId } = await params;

    const [song, user] = await Promise.all([
      prisma.song.findFirst({ where: { id: songId, userId: userId! } }),
      prisma.user.findUnique({ where: { id: userId! }, select: { name: true } }),
    ]);

    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (!song.audioUrl) {
      return NextResponse.json(
        { error: "No audio available", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Rate limit: downloads per hour per user
    const { acquired, status } = await acquireRateLimitSlot(userId!, "download");
    if (!acquired) {
      return NextResponse.json(
        {
          error: "Download rate limit exceeded. Try again later.",
          code: "RATE_LIMIT",
          resetAt: status.resetAt,
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(
              (new Date(status.resetAt).getTime() - Date.now()) / 1000
            ).toString(),
            "X-RateLimit-Limit": DOWNLOAD_RATE_LIMIT.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": status.resetAt,
          },
        }
      );
    }

    const url = new URL(request.url);
    const requestedFormat = (url.searchParams.get("format") ?? "native") as DownloadFormat | "native";
    const embedMetadata = url.searchParams.get("metadata") !== "false";

    // Detect native source format
    const sourceExt = song.audioUrl.toLowerCase().includes(".wav") ? "wav" : "mp3";

    // Resolve the effective format to serve
    let targetFormat: "mp3" | "wav" | "flac";
    if (requestedFormat === "native" || requestedFormat === sourceExt) {
      targetFormat = sourceExt;
    } else if (requestedFormat === "flac") {
      if (sourceExt !== "wav") {
        return NextResponse.json(
          {
            error: "FLAC export requires a WAV source. Convert this song to WAV first.",
            code: "FORMAT_UNAVAILABLE",
          },
          { status: 422 }
        );
      }
      targetFormat = "flac";
    } else if (requestedFormat === "wav") {
      if (sourceExt !== "wav") {
        return NextResponse.json(
          {
            error: "WAV export not available. Convert this song to WAV first.",
            code: "FORMAT_UNAVAILABLE",
          },
          { status: 422 }
        );
      }
      targetFormat = "wav";
    } else {
      // mp3 requested but source is wav — serve native wav
      targetFormat = sourceExt;
    }

    // Serve from local cache when available, otherwise fetch from Suno
    const cached = audioCache.get(song.id)?.data ?? null;
    let audioBuffer: ArrayBuffer;
    if (cached) {
      audioBuffer = cached.buffer.slice(cached.byteOffset, cached.byteOffset + cached.byteLength) as ArrayBuffer;
    } else {
      const upstream = await fetch(song.audioUrl);
      if (!upstream.ok) {
        return NextResponse.json(
          { error: "Failed to fetch audio from source", code: "INTERNAL_ERROR" },
          { status: 502 }
        );
      }
      audioBuffer = await upstream.arrayBuffer();
    }

    // Increment download count (fire and forget)
    prisma.song.update({
      where: { id: song.id },
      data: { downloadCount: { increment: 1 } },
    }).catch(() => {});

    // Build safe filename slug
    const titleSlug = (song.title ?? "song")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "song";
    let contentType: string;
    let fileExt: string;

    if (targetFormat === "flac") {
      // Convert WAV → FLAC
      const flacBuffer = wavToFlac(new Uint8Array(audioBuffer));
      if (!flacBuffer) {
        return NextResponse.json(
          { error: "FLAC conversion failed — unsupported WAV format", code: "CONVERSION_ERROR" },
          { status: 422 }
        );
      }
      audioBuffer = flacBuffer.buffer as ArrayBuffer;
      contentType = "audio/flac";
      fileExt = "flac";
    } else if (targetFormat === "wav") {
      contentType = "audio/wav";
      fileExt = "wav";
    } else {
      contentType = "audio/mpeg";
      fileExt = "mp3";
    }

    // Embed metadata (only for MP3 and WAV; FLAC metadata would require Vorbis comments)
    if (embedMetadata && targetFormat !== "flac") {
      let coverArt: SongMetadata["coverArt"] = null;
      if (song.imageUrl && targetFormat === "mp3") {
        try {
          if (song.imageUrl.startsWith("data:image/")) {
            const commaIdx = song.imageUrl.indexOf(",");
            if (commaIdx !== -1) {
              const mimeMatch = song.imageUrl.match(/^data:([^;]+);base64,/);
              const mimeType = mimeMatch?.[1] ?? "image/jpeg";
              const b64 = song.imageUrl.slice(commaIdx + 1);
              const binary = Buffer.from(b64, "base64");
              coverArt = { data: new Uint8Array(binary), mimeType };
            }
          } else {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            const imgRes = await fetch(song.imageUrl, { signal: ctrl.signal });
            clearTimeout(timer);
            if (imgRes.ok) {
              const ct = imgRes.headers.get("content-type") ?? "image/jpeg";
              const mimeType = ct.split(";")[0].trim();
              if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") {
                const imgBuf = await imgRes.arrayBuffer();
                coverArt = { data: new Uint8Array(imgBuf), mimeType };
              }
            }
          }
        } catch {
          // Non-fatal — proceed without album art
        }
      }

      const meta: SongMetadata = {
        title: song.title ?? undefined,
        artist: user?.name ?? "SunoFlow User",
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

    const filename = `${titleSlug}.${fileExt}`;
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    headers.set("Content-Length", String(audioBuffer.byteLength));
    headers.set("X-RateLimit-Limit", DOWNLOAD_RATE_LIMIT.toString());
    headers.set("X-RateLimit-Remaining", status.remaining.toString());
    headers.set("X-RateLimit-Reset", status.resetAt);

    return new Response(audioBuffer, { status: 200, headers });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
