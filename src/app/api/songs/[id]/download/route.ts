import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { embedId3Tags, embedWavMetadata } from "@/lib/audio-metadata";
import type { SongMetadata } from "@/lib/audio-metadata";

const DOWNLOAD_RATE_LIMIT = 50; // per hour

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

    // Rate limit: 50 downloads per hour per user
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

    // Proxy the audio from the external URL (buffer for metadata embedding)
    const upstream = await fetch(song.audioUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Failed to fetch audio from source", code: "INTERNAL_ERROR" },
        { status: 502 }
      );
    }

    // Increment download count (fire and forget)
    prisma.song.update({
      where: { id: song.id },
      data: { downloadCount: { increment: 1 } },
    }).catch(() => {});

    const ext = song.audioUrl.toLowerCase().includes(".wav") ? "wav" : "mp3";
    const contentType = ext === "wav" ? "audio/wav" : "audio/mpeg";

    // Build safe filename
    const titleSlug = (song.title ?? "song")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "song";
    const filename = `${titleSlug}.${ext}`;

    // Check if metadata embedding is requested (default: true)
    const url = new URL(request.url);
    const embedMetadata = url.searchParams.get("metadata") !== "false";

    let audioBuffer = await upstream.arrayBuffer();

    if (embedMetadata) {
      // Attempt to fetch cover art (fire-and-forget failure — don't block download)
      let coverArt: SongMetadata["coverArt"] = null;
      if (song.imageUrl && ext === "mp3") {
        try {
          if (song.imageUrl.startsWith("data:image/")) {
            // SVG or other data URI — decode the base64 payload
            const commaIdx = song.imageUrl.indexOf(",");
            if (commaIdx !== -1) {
              const mimeMatch = song.imageUrl.match(/^data:([^;]+);base64,/);
              const mimeType = mimeMatch?.[1] ?? "image/jpeg";
              const b64 = song.imageUrl.slice(commaIdx + 1);
              const binary = Buffer.from(b64, "base64");
              coverArt = { data: new Uint8Array(binary), mimeType };
            }
          } else {
            // External URL — fetch with timeout
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            const imgRes = await fetch(song.imageUrl, { signal: ctrl.signal });
            clearTimeout(timer);
            if (imgRes.ok) {
              const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
              const mimeType = contentType.split(";")[0].trim();
              // Only embed images (skip SVG — players typically expect raster art)
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
        ext === "wav"
          ? embedWavMetadata(audioBytes, meta)
          : embedId3Tags(audioBytes, meta);
      audioBuffer = tagged.buffer as ArrayBuffer;
    }

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
