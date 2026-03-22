import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

const MAX_PLAYLISTS = 50;

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const playlists = await prisma.playlist.findMany({
      where: { userId: userId },
      include: { _count: { select: { songs: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ playlists });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (name.trim().length > 100) {
      return NextResponse.json(
        { error: "Name must be 100 characters or less" },
        { status: 400 }
      );
    }

    const count = await prisma.playlist.count({
      where: { userId: userId },
    });

    if (count >= MAX_PLAYLISTS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_PLAYLISTS} playlists reached` },
        { status: 400 }
      );
    }

    const playlist = await prisma.playlist.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        userId: userId,
      },
      include: { _count: { select: { songs: true } } },
    });

    return NextResponse.json({ playlist }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
