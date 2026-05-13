import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, notFound } from "@/lib/api-error";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

const MAX_TEMPLATES = 50;
const createTemplateSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  tags: z.string()
    .trim()
    .min(1, "Tags are required")
    .max(500, "Tags must be 500 characters or less"),
  sourceSongId: z.string().optional(),
});

export const GET = authRoute(async (_request, { auth }) => {
  const templates = await prisma.styleTemplate.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ templates });
}, { route: "/api/style-templates" });

export const POST = authRoute(async (_request, { auth, body }) => {
  const sourceSongId = body.sourceSongId?.trim() || null;

  if (sourceSongId) {
    const song = await prisma.song.findFirst({ where: { id: sourceSongId, userId: auth.userId } });
    if (!song) {
      return notFound("Source song not found");
    }
  }

  const count = await prisma.styleTemplate.count({ where: { userId: auth.userId } });
  if (count >= MAX_TEMPLATES) {
    return badRequest(`Maximum of ${MAX_TEMPLATES} style templates reached. Delete one to create a new one.`);
  }

  const template = await prisma.styleTemplate.create({
    data: {
      userId: auth.userId,
      name: body.name,
      tags: body.tags,
      sourceSongId,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}, {
  route: "/api/style-templates",
  body: createTemplateSchema,
});
