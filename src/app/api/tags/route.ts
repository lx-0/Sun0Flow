import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/api-error";

const MAX_TAGS_PER_USER = 50;

export const GET = authRoute(async (_request, { auth }) => {
  const tags = await prisma.tag.findMany({
    where: { userId: auth.userId },
    include: { _count: { select: { songTags: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ tags });
}, { route: "/api/tags" });

export const POST = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
  const rawColor = typeof body.color === "string" ? body.color.trim() : "#7c3aed";
  const color = /^#[0-9A-Fa-f]{6}$/.test(rawColor) ? rawColor : "#7c3aed";

  if (!name || name.length > 50) {
    return badRequest("Tag name is required (max 50 chars)");
  }

  const count = await prisma.tag.count({ where: { userId: auth.userId } });
  if (count >= MAX_TAGS_PER_USER) {
    return badRequest(`Maximum ${MAX_TAGS_PER_USER} tags allowed`);
  }

  const existing = await prisma.tag.findUnique({
    where: { userId_name: { userId: auth.userId, name } },
  });
  if (existing) {
    return NextResponse.json({ tag: existing });
  }

  const tag = await prisma.tag.create({
    data: { name, color, userId: auth.userId },
  });

  return NextResponse.json({ tag }, { status: 201 });
}, { route: "/api/tags" });
