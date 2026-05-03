import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { generateSong } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { releaseRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { insufficientCredits } from "@/lib/api-error";
import { getMonthlyCreditUsage, CREDIT_COSTS } from "@/lib/credits";
import {
  userFriendlyError,
  enforceRateLimit,
  recordCreditsAndNotify,
  createSongRecord,
} from "@/lib/generation";

const MAX_VARIATIONS = 5;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { id } = await params;

    const song = await prisma.song.findUnique({ where: { id } });
    if (!song || song.userId !== userId) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    let rootId = id;
    if (song.parentSongId) {
      let current = song;
      while (current.parentSongId) {
        const parent = await prisma.song.findUnique({ where: { id: current.parentSongId } });
        if (!parent) break;
        current = parent;
      }
      rootId = current.id;
    }

    const root = rootId === id ? song : await prisma.song.findUnique({ where: { id: rootId } });
    const variations = await prisma.song.findMany({
      where: { parentSongId: rootId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        prompt: true,
        tags: true,
        audioUrl: true,
        imageUrl: true,
        duration: true,
        lyrics: true,
        generationStatus: true,
        isInstrumental: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      root: root ? {
        id: root.id,
        title: root.title,
        prompt: root.prompt,
        tags: root.tags,
        audioUrl: root.audioUrl,
        imageUrl: root.imageUrl,
        duration: root.duration,
        lyrics: root.lyrics,
        generationStatus: root.generationStatus,
        isInstrumental: root.isInstrumental,
        createdAt: root.createdAt,
      } : null,
      variations,
      variationCount: variations.length,
      maxVariations: MAX_VARIATIONS,
    });
  } catch (error) {
    logServerError("variations-list", error, { route: "/api/songs/variations" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;
    const { id: parentId } = await params;

    const parentSong = await prisma.song.findUnique({ where: { id: parentId } });
    if (!parentSong || parentSong.userId !== userId) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const rootId = parentSong.parentSongId ?? parentId;

    const variationCount = await prisma.song.count({
      where: { parentSongId: rootId },
    });
    if (variationCount >= MAX_VARIATIONS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_VARIATIONS} variations per song reached.`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const creditUsage = await getMonthlyCreditUsage(userId);
    if (creditUsage.creditsRemaining < CREDIT_COSTS.generate) {
      return insufficientCredits(
        `Insufficient credits. You need ${CREDIT_COSTS.generate} credits but only have ${creditUsage.creditsRemaining} remaining.`
      );
    }

    const rateLimitResult = await enforceRateLimit(userId);
    if (rateLimitResult.limited) return rateLimitResult.response;
    const rateLimitStatus = rateLimitResult.status;

    const body = await request.json();
    const prompt = (body.prompt?.trim() || parentSong.prompt || "").trim();
    const rawTags = (body.tags?.trim() || parentSong.tags || "").trim();
    const tags = rawTags
      ? rawTags.toLowerCase().includes("remix") ? rawTags : `${rawTags}, remix`
      : "remix";
    const title = body.title?.trim() || (parentSong.title ? `${parentSong.title} (variation)` : null);
    const makeInstrumental = body.makeInstrumental ?? parentSong.isInstrumental;

    if (!prompt) {
      return NextResponse.json({ error: "A prompt is required", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

    const songParams = {
      title: title || null,
      prompt,
      tags: tags || null,
      isInstrumental: Boolean(makeInstrumental),
      parentSongId: rootId,
    };

    let savedSong;
    if (!hasApiKey) {
      savedSong = await createSongRecord(userId, songParams, { status: "ready", mock: mockSongs[0] });
    } else {
      try {
        const result = await generateSong(
          prompt,
          { title: title || undefined, style: tags || undefined, instrumental: Boolean(makeInstrumental) },
          userApiKey
        );

        savedSong = await createSongRecord(userId, songParams, { status: "pending", sunoJobId: result.taskId });
      } catch (apiError) {
        logServerError("variation-api", apiError, { userId, route: `/api/songs/${parentId}/variations` });

        await releaseRateLimitSlot(userId).catch(() => {});

        const { message: errorMsg } = userFriendlyError(apiError);
        savedSong = await createSongRecord(userId, songParams, { status: "failed", errorMessage: errorMsg });

        return NextResponse.json(
          { song: savedSong, error: errorMsg, rateLimit: rateLimitStatus },
          { status: 201 }
        );
      }
    }

    await recordCreditsAndNotify(userId, "generate", {
      songId: savedSong.id,
      description: `Variation generation: ${savedSong.title || "Untitled"}`,
    });

    return NextResponse.json(
      { song: savedSong, rateLimit: rateLimitStatus },
      { status: 201 }
    );
  } catch (error) {
    logServerError("variation-route", error, { route: "/api/songs/variations" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
