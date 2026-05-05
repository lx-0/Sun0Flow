import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { internalError } from "@/lib/api-error";
import { logServerError } from "@/lib/error-logger";

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const state = await prisma.playbackState.findUnique({
      where: { userId },
      include: {
        song: {
          select: {
            id: true,
            title: true,
            audioUrl: true,
            imageUrl: true,
            duration: true,
            lyrics: true,
          },
        },
      },
    });

    if (!state) {
      return NextResponse.json({ state: null });
    }

    return NextResponse.json({ state });
  } catch (error) {
    logServerError("GET /api/user/playback-state", error, {
      route: "/api/user/playback-state",
    });
    return internalError();
  }
}

export async function PUT(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json();
    const {
      songId, position, queue, volume, shuffleVersions,
      shuffle, repeat, muted, eqGains, eqSpeed, eqPitch,
    } = body;

    if (!songId || typeof songId !== "string") {
      return NextResponse.json(
        { error: "songId is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (typeof position !== "number" || position < 0) {
      return NextResponse.json(
        { error: "position must be a non-negative number", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (!Array.isArray(queue)) {
      return NextResponse.json(
        { error: "queue must be an array", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Verify song belongs to user
    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
      select: { id: true },
    });
    if (!song) {
      return NextResponse.json(
        { error: "Song not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const validEqGains = Array.isArray(eqGains) && eqGains.length === 5 && eqGains.every((g: unknown) => typeof g === "number")
      ? eqGains : [0, 0, 0, 0, 0];
    const validEqSpeed = typeof eqSpeed === "number" && eqSpeed >= 0.5 && eqSpeed <= 2 ? eqSpeed : 1;
    const validEqPitch = typeof eqPitch === "number" && eqPitch >= -6 && eqPitch <= 6 ? eqPitch : 0;

    const state = await prisma.playbackState.upsert({
      where: { userId },
      create: {
        userId,
        songId,
        position,
        queue,
        volume: typeof volume === "number" ? Math.max(0, Math.min(1, volume)) : 1,
        shuffleVersions: shuffleVersions === true,
        shuffle: shuffle === true,
        repeat: typeof repeat === "string" && ["off", "repeat-all", "repeat-one"].includes(repeat) ? repeat : "off",
        muted: muted === true,
        eqGains: validEqGains,
        eqSpeed: validEqSpeed,
        eqPitch: validEqPitch,
      },
      update: {
        songId,
        position,
        queue,
        volume: typeof volume === "number" ? Math.max(0, Math.min(1, volume)) : 1,
        shuffleVersions: shuffleVersions === true,
        shuffle: shuffle === true,
        repeat: typeof repeat === "string" && ["off", "repeat-all", "repeat-one"].includes(repeat) ? repeat : "off",
        muted: muted === true,
        eqGains: validEqGains,
        eqSpeed: validEqSpeed,
        eqPitch: validEqPitch,
      },
    });

    return NextResponse.json({ state });
  } catch (error) {
    logServerError("PUT /api/user/playback-state", error, {
      route: "/api/user/playback-state",
    });
    return internalError();
  }
}
