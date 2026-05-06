import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_TAGS_PER_SONG = 10;
const MAX_TAGS_PER_USER = 50;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id, userId: userId },
    });
    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const songTags = await prisma.songTag.findMany({
      where: { songId: song.id },
      include: { tag: true },
      orderBy: { tag: { name: "asc" } },
    });

    return NextResponse.json({ tags: songTags.map((st) => st.tag) });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id, userId: userId },
    });
    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    const tagName = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
    const tagId = typeof body.tagId === "string" ? body.tagId : "";

    if (!tagName && !tagId) {
      return NextResponse.json({ error: "Tag name or tagId required", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    if (tagName && tagName.length > 50) {
      return NextResponse.json({ error: "Tag name must be 50 characters or less", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    // Check tags-per-song limit
    const songTagCount = await prisma.songTag.count({ where: { songId: song.id } });
    if (songTagCount >= MAX_TAGS_PER_SONG) {
      return NextResponse.json({ error: `Maximum ${MAX_TAGS_PER_SONG} tags per song`, code: "VALIDATION_ERROR" }, { status: 400 });
    }

    let tag;
    if (tagId) {
      tag = await prisma.tag.findFirst({
        where: { id: tagId, userId: userId },
      });
      if (!tag) {
        return NextResponse.json({ error: "Tag not found", code: "NOT_FOUND" }, { status: 404 });
      }
    } else {
      // Find or create tag by name
      tag = await prisma.tag.findUnique({
        where: { userId_name: { userId: userId, name: tagName } },
      });
      if (!tag) {
        // Check user tag limit before creating
        const userTagCount = await prisma.tag.count({ where: { userId: userId } });
        if (userTagCount >= MAX_TAGS_PER_USER) {
          return NextResponse.json({ error: `Maximum ${MAX_TAGS_PER_USER} tags allowed`, code: "VALIDATION_ERROR" }, { status: 400 });
        }
        tag = await prisma.tag.create({
          data: { name: tagName, userId: userId },
        });
      }
    }

    // Check if already tagged
    const existing = await prisma.songTag.findUnique({
      where: { songId_tagId: { songId: song.id, tagId: tag.id } },
    });
    if (existing) {
      return NextResponse.json({ tag });
    }

    await prisma.songTag.create({
      data: { songId: song.id, tagId: tag.id },
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
