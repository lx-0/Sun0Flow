import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logServerError } from "@/lib/error-logger";
import {
  buildSongEmbeddingText,
  generateEmbeddingsBatch,
  EMBEDDING_MODEL,
} from "@/lib/embeddings";

/**
 * POST /api/cron/generate-embeddings
 *
 * Batch-generates OpenAI embeddings for songs that don't yet have one.
 * Processes up to BATCH_SIZE songs per invocation to stay within timeout limits.
 * Should be called on a schedule (e.g., every 15 minutes) via Railway cron or
 * an external scheduler.
 *
 * Protected by CRON_SECRET bearer token.
 */

const BATCH_SIZE = 50; // songs per cron run (each call = 1 OpenAI batch API request)

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    // Find ready songs with no embedding yet, oldest first
    const songs = await prisma.song.findMany({
      where: {
        generationStatus: "ready",
        archivedAt: null,
        songEmbedding: null,
      },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      select: {
        id: true,
        title: true,
        tags: true,
        prompt: true,
        lyrics: true,
      },
    });

    if (songs.length === 0) {
      return NextResponse.json({ processed: 0, message: "No songs need embedding" });
    }

    const texts = songs.map((s) => buildSongEmbeddingText(s));
    const embeddings = await generateEmbeddingsBatch(texts);

    let successCount = 0;
    let failCount = 0;

    const upserts = songs.map(async (song, i) => {
      const embedding = embeddings[i];
      if (!embedding) {
        failCount++;
        logger.warn({ songId: song.id }, "generate-embeddings: failed to generate embedding");
        return;
      }

      await prisma.songEmbedding.upsert({
        where: { songId: song.id },
        create: {
          songId: song.id,
          embedding: embedding as unknown as import("@prisma/client").Prisma.JsonArray,
          model: EMBEDDING_MODEL,
        },
        update: {
          embedding: embedding as unknown as import("@prisma/client").Prisma.JsonArray,
          model: EMBEDDING_MODEL,
        },
      });
      successCount++;
    });

    await Promise.all(upserts);

    logger.info(
      { processed: songs.length, success: successCount, fail: failCount },
      "generate-embeddings: cron run complete"
    );

    return NextResponse.json({
      processed: songs.length,
      success: successCount,
      fail: failCount,
    });
  } catch (error) {
    logServerError("generate-embeddings", error, { route: "/api/cron/generate-embeddings" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
