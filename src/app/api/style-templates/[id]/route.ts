import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id } = await params;
    const { name, tags } = await request.json();

    const template = await prisma.styleTemplate.findFirst({
      where: { id, userId },
    });

    if (!template) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const data: { name?: string; tags?: string } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Name cannot be empty", code: "VALIDATION_ERROR" }, { status: 400 });
      }
      if (name.length > 100) {
        return NextResponse.json({ error: "Name must be 100 characters or less", code: "VALIDATION_ERROR" }, { status: 400 });
      }
      data.name = name.trim();
    }

    if (tags !== undefined) {
      if (typeof tags !== "string" || !tags.trim()) {
        return NextResponse.json({ error: "Tags cannot be empty", code: "VALIDATION_ERROR" }, { status: 400 });
      }
      if (tags.length > 500) {
        return NextResponse.json({ error: "Tags must be 500 characters or less", code: "VALIDATION_ERROR" }, { status: 400 });
      }
      data.tags = tags.trim();
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const updated = await prisma.styleTemplate.update({
      where: { id },
      data,
    });

    return NextResponse.json({ template: updated });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id } = await params;

    const template = await prisma.styleTemplate.findFirst({
      where: { id, userId },
    });

    if (!template) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    await prisma.styleTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
