import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const tag = await prisma.tag.findFirst({
      where: { id: params.id, userId: userId },
    });
    if (!tag) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : undefined;
    const color = typeof body.color === "string" ? body.color.trim() : undefined;

    if (name !== undefined && (!name || name.length > 50)) {
      return NextResponse.json({ error: "Tag name is required (max 50 chars)" }, { status: 400 });
    }

    // Check duplicate name if renaming
    if (name && name !== tag.name) {
      const existing = await prisma.tag.findUnique({
        where: { userId_name: { userId: userId, name } },
      });
      if (existing) {
        return NextResponse.json({ error: "A tag with that name already exists" }, { status: 409 });
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
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const tag = await prisma.tag.findFirst({
      where: { id: params.id, userId: userId },
    });
    if (!tag) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.tag.delete({ where: { id: tag.id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
