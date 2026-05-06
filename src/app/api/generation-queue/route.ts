import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_QUEUE_SIZE = 10;

/** GET: List queue items for the current user */
export async function GET(request: Request) {
  const { userId, error } = await resolveUser(request);
  if (error) return error;

  const items = await prisma.generationQueueItem.findMany({
    where: { userId, status: { in: ["pending", "processing"] } },
    orderBy: { position: "asc" },
  });

  return NextResponse.json({ items });
}

/** POST: Add an item to the queue */
export async function POST(request: Request) {
  const { userId, error } = await resolveUser(request);
  if (error) return error;

  const { prompt, title, tags, makeInstrumental, personaId } =
    await request.json();

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json(
      { error: "A prompt is required", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  if (prompt.length > 3000) {
    return NextResponse.json(
      { error: "Prompt must be 3000 characters or less", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  // Check queue size
  const pendingCount = await prisma.generationQueueItem.count({
    where: { userId, status: { in: ["pending", "processing"] } },
  });

  if (pendingCount >= MAX_QUEUE_SIZE) {
    return NextResponse.json(
      { error: `Queue is full (max ${MAX_QUEUE_SIZE} items)` },
      { status: 400 }
    );
  }

  // Get next position
  const lastItem = await prisma.generationQueueItem.findFirst({
    where: { userId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const nextPosition = (lastItem?.position ?? -1) + 1;

  const item = await prisma.generationQueueItem.create({
    data: {
      userId,
      prompt: prompt.trim(),
      title: title?.trim() || null,
      tags: tags?.trim() || null,
      makeInstrumental: Boolean(makeInstrumental),
      personaId: personaId || null,
      position: nextPosition,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
