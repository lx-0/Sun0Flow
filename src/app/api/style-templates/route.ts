import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_TEMPLATES = 50;

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const templates = await prisma.styleTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { name, tags, sourceSongId } = await request.json();

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "Name must be 100 characters or less", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (!tags || typeof tags !== "string" || !tags.trim()) {
      return NextResponse.json({ error: "Tags are required", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (tags.length > 500) {
      return NextResponse.json({ error: "Tags must be 500 characters or less", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    if (sourceSongId) {
      const song = await prisma.song.findFirst({ where: { id: sourceSongId, userId } });
      if (!song) {
        return NextResponse.json({ error: "Source song not found", code: "NOT_FOUND" }, { status: 404 });
      }
    }

    const count = await prisma.styleTemplate.count({ where: { userId } });
    if (count >= MAX_TEMPLATES) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_TEMPLATES} style templates reached. Delete one to create a new one.`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const template = await prisma.styleTemplate.create({
      data: {
        userId,
        name: name.trim(),
        tags: tags.trim(),
        sourceSongId: sourceSongId || null,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
