import { NextResponse } from "next/server";
import { cronRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  buildSongEmbeddingText,
  generateEmbeddingsBatch,
  EMBEDDING_MODEL,
} from "@/lib/embeddings";

const BATCH_SIZE = 50;

export const POST = cronRoute(async () => {
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
});
