import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { songRoute } from "@/lib/route-handler";
import { badRequest } from "@/lib/api-error";

const MAX_TAGS_PER_SONG = 10;
const MAX_TAGS_PER_USER = 50;

export const GET = songRoute(async (_request, { song }) => {
  const songTags = await prisma.songTag.findMany({
    where: { songId: song.id },
    include: { tag: true },
    orderBy: { tag: { name: "asc" } },
  });

  return NextResponse.json({ tags: songTags.map((st) => st.tag) });
}, { route: "/api/songs/[id]/tags" });

export const POST = songRoute(async (request, { auth, song }) => {
  const body = await request.json();
  const tagName = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
  const tagId = typeof body.tagId === "string" ? body.tagId : "";

  if (!tagName && !tagId) {
    return badRequest("Tag name or tagId required");
  }

  if (tagName && tagName.length > 50) {
    return badRequest("Tag name must be 50 characters or less");
  }

  const songTagCount = await prisma.songTag.count({ where: { songId: song.id } });
  if (songTagCount >= MAX_TAGS_PER_SONG) {
    return badRequest(`Maximum ${MAX_TAGS_PER_SONG} tags per song`);
  }

  let tag;
  if (tagId) {
    tag = await prisma.tag.findFirst({
      where: { id: tagId, userId: auth.userId },
    });
    if (!tag) {
      return NextResponse.json({ error: "Tag not found", code: "NOT_FOUND" }, { status: 404 });
    }
  } else {
    tag = await prisma.tag.findUnique({
      where: { userId_name: { userId: auth.userId, name: tagName } },
    });
    if (!tag) {
      const userTagCount = await prisma.tag.count({ where: { userId: auth.userId } });
      if (userTagCount >= MAX_TAGS_PER_USER) {
        return badRequest(`Maximum ${MAX_TAGS_PER_USER} tags allowed`);
      }
      tag = await prisma.tag.create({
        data: { name: tagName, userId: auth.userId },
      });
    }
  }

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
}, { route: "/api/songs/[id]/tags" });
