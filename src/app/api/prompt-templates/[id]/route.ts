import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/prompt-templates/[id] — update a user template
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const template = await prisma.promptTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (template.isBuiltIn) {
      return NextResponse.json({ error: "Cannot edit built-in templates", code: "FORBIDDEN" }, { status: 403 });
    }

    if (template.userId !== userId) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "Name is required", code: "VALIDATION_ERROR" }, { status: 400 });
      }
      data.name = body.name.trim();
    }
    if (body.prompt !== undefined) {
      if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
        return NextResponse.json({ error: "Prompt is required", code: "VALIDATION_ERROR" }, { status: 400 });
      }
      data.prompt = body.prompt.trim();
    }
    if (body.style !== undefined) data.style = body.style?.trim() || null;
    if (body.category !== undefined) data.category = body.category?.trim() || null;
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.isInstrumental !== undefined) data.isInstrumental = Boolean(body.isInstrumental);

    const updated = await prisma.promptTemplate.update({
      where: { id },
      data,
    });

    return NextResponse.json({ template: updated });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

// DELETE /api/prompt-templates/[id] — delete a user template
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const template = await prisma.promptTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (template.isBuiltIn) {
      return NextResponse.json({ error: "Cannot delete built-in templates", code: "FORBIDDEN" }, { status: 403 });
    }

    if (template.userId !== userId) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }

    await prisma.promptTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
