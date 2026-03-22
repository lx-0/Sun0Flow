import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { id } = await params;

    const persona = await prisma.persona.findUnique({ where: { id } });
    if (!persona || persona.userId !== userId) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    await prisma.persona.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logServerError("personas-delete", error, { route: "/api/personas/[id]" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
