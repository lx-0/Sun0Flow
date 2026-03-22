import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

const MAX_BATCH_SIZE = 50;
const VALID_ACTIONS = ["favorite", "unfavorite", "delete"] as const;
type BatchAction = (typeof VALID_ACTIONS)[number];

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const body = await request.json();
    const { action, songIds } = body as { action: string; songIds: string[] };

    if (!action || !VALID_ACTIONS.includes(action as BatchAction)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!Array.isArray(songIds) || songIds.length === 0) {
      return NextResponse.json(
        { error: "songIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (songIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BATCH_SIZE} songs per batch operation` },
        { status: 400 }
      );
    }

    // Verify all songs belong to the user
    const userSongs = await prisma.song.findMany({
      where: { id: { in: songIds }, userId },
      select: { id: true },
    });

    const validIds = userSongs.map((s) => s.id);
    if (validIds.length === 0) {
      return NextResponse.json({ error: "No valid songs found" }, { status: 404 });
    }

    let affected = 0;

    switch (action as BatchAction) {
      case "favorite": {
        const result = await prisma.song.updateMany({
          where: { id: { in: validIds }, userId },
          data: { isFavorite: true },
        });
        affected = result.count;
        break;
      }
      case "unfavorite": {
        const result = await prisma.song.updateMany({
          where: { id: { in: validIds }, userId },
          data: { isFavorite: false },
        });
        affected = result.count;
        break;
      }
      case "delete": {
        const result = await prisma.song.deleteMany({
          where: { id: { in: validIds }, userId },
        });
        affected = result.count;
        break;
      }
    }

    return NextResponse.json({ action, affected, songIds: validIds });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
