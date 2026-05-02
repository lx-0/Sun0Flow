import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, apiError, ErrorCode } from "@/lib/api-error";

export const PATCH = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const tag = await prisma.tag.findFirst({
    where: { id: params.id, userId: auth.userId },
  });
  if (!tag) {
    return notFound();
  }

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : undefined;
  const rawColor = typeof body.color === "string" ? body.color.trim() : undefined;

  if (name !== undefined && (!name || name.length > 50)) {
    return badRequest("Tag name is required (max 50 chars)");
  }

  if (rawColor !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(rawColor)) {
    return badRequest("color must be a valid hex color (e.g. #7c3aed)");
  }

  const color = rawColor;

  if (name && name !== tag.name) {
    const existing = await prisma.tag.findUnique({
      where: { userId_name: { userId: auth.userId, name } },
    });
    if (existing) {
      return apiError("A tag with that name already exists", ErrorCode.CONFLICT, 409);
    }
  }

  const updated = await prisma.tag.update({
    where: { id: tag.id },
    data: {
      ...(name !== undefined && { name }),
      ...(color !== undefined && { color }),
    },
  });

  return NextResponse.json({ tag: updated });
}, { route: "/api/tags/[id]" });

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const tag = await prisma.tag.findFirst({
    where: { id: params.id, userId: auth.userId },
  });
  if (!tag) {
    return notFound();
  }

  await prisma.tag.delete({ where: { id: tag.id } });

  return NextResponse.json({ success: true });
}, { route: "/api/tags/[id]" });
