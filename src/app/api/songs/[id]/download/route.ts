import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, recordRateLimitHit } from "@/lib/rate-limit";

const DOWNLOAD_RATE_LIMIT = 50; // per hour

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const song = await prisma.song.findFirst({
      where: { id: params.id, userId: session.user.id },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!song.audioUrl) {
      return NextResponse.json(
        { error: "No audio available" },
        { status: 404 }
      );
    }

    // Rate limit: 50 downloads per hour per user
    const { allowed, status } = await checkRateLimit(
      session.user.id,
      "download"
    );
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Download rate limit exceeded. Try again later.",
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

    // Proxy the audio from the external URL
    const upstream = await fetch(song.audioUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Failed to fetch audio from source" },
        { status: 502 }
      );
    }

    // Record rate limit hit and increment download count
    await Promise.all([
      recordRateLimitHit(session.user.id, "download"),
      prisma.song.update({
        where: { id: song.id },
        data: { downloadCount: { increment: 1 } },
      }),
    ]);

    // Build safe filename
    const title = (song.title ?? "song")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "song";
    const ext = song.audioUrl.toLowerCase().includes(".wav") ? "wav" : "mp3";
    const contentType = ext === "wav" ? "audio/wav" : "audio/mpeg";
    const filename = `${title}.${ext}`;

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    headers.set(
      "X-RateLimit-Limit",
      DOWNLOAD_RATE_LIMIT.toString()
    );
    headers.set(
      "X-RateLimit-Remaining",
      status.remaining.toString()
    );
    headers.set("X-RateLimit-Reset", status.resetAt);

    // Forward content-length if available
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
