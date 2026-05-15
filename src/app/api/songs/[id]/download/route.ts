import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { prepareSongDownload } from "@/lib/songs";
import type { DownloadFormat } from "@/lib/songs";

const DOWNLOAD_RATE_LIMIT = 50;

export const GET = authRoute<{ id: string }>(
  async (request, { auth, params }) => {
    const [song, user] = await Promise.all([
      prisma.song.findFirst({ where: { id: params.id, userId: auth.userId } }),
      prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } }),
    ]);

    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const { acquired, status } = await acquireRateLimitSlot(auth.userId, "download");
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
              (new Date(status.resetAt).getTime() - Date.now()) / 1000,
            ).toString(),
            "X-RateLimit-Limit": DOWNLOAD_RATE_LIMIT.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": status.resetAt,
          },
        },
      );
    }

    const requestedFormat = (request.nextUrl.searchParams.get("format") ?? "native") as DownloadFormat | "native";
    const embedMetadata = request.nextUrl.searchParams.get("metadata") !== "false";

    const result = await prepareSongDownload({
      song,
      artistName: user?.name ?? "SunoFlow User",
      requestedFormat,
      embedMetadata,
    });

    if (!result.ok) return resultResponse(result);

    const headers = new Headers();
    headers.set("Content-Type", result.contentType);
    headers.set("Content-Disposition", `attachment; filename="${result.filename}"`);
    headers.set("Content-Length", String(result.buffer.byteLength));
    headers.set("X-RateLimit-Limit", DOWNLOAD_RATE_LIMIT.toString());
    headers.set("X-RateLimit-Remaining", status.remaining.toString());
    headers.set("X-RateLimit-Reset", status.resetAt);

    return new NextResponse(result.buffer, { status: 200, headers });
  },
  { route: "/api/songs/[id]/download" },
);
