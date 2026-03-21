import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_TAGS_PER_SONG = 10;
const MAX_TAGS_PER_USER = 30;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const song = await prisma.song.findFirst({
      where: { id: params.id, userId: session.user.id },
    });
    if (!song) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const songTags = await prisma.songTag.findMany({
      where: { songId: song.id },
      include: { tag: true },
      orderBy: { tag: { name: "asc" } },
    });

    return NextResponse.json({ tags: songTags.map((st) => st.tag) });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const song = await prisma.song.findFirst({
      where: { id: params.id, userId: session.user.id },
    });
    if (!song) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const tagName = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
    const tagId = typeof body.tagId === "string" ? body.tagId : "";

    if (!tagName && !tagId) {
      return NextResponse.json({ error: "Tag name or tagId required" }, { status: 400 });
    }

    // Check tags-per-song limit
    const songTagCount = await prisma.songTag.count({ where: { songId: song.id } });
    if (songTagCount >= MAX_TAGS_PER_SONG) {
      return NextResponse.json({ error: `Maximum ${MAX_TAGS_PER_SONG} tags per song` }, { status: 400 });
    }

    let tag;
    if (tagId) {
      tag = await prisma.tag.findFirst({
        where: { id: tagId, userId: session.user.id },
      });
      if (!tag) {
        return NextResponse.json({ error: "Tag not found" }, { status: 404 });
      }
    } else {
      // Find or create tag by name
      tag = await prisma.tag.findUnique({
        where: { userId_name: { userId: session.user.id, name: tagName } },
      });
      if (!tag) {
        // Check user tag limit before creating
        const userTagCount = await prisma.tag.count({ where: { userId: session.user.id } });
        if (userTagCount >= MAX_TAGS_PER_USER) {
          return NextResponse.json({ error: `Maximum ${MAX_TAGS_PER_USER} tags allowed` }, { status: 400 });
        }
        tag = await prisma.tag.create({
          data: { name: tagName, userId: session.user.id },
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
