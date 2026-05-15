import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const DELETE = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { data: persona, error } = requireOwned(
      await prisma.persona.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Persona",
    );
    if (error) return error;

    await prisma.persona.delete({ where: { id: persona.id } });

    return NextResponse.json({ success: true });
  },
  { route: "/api/personas/[id]" },
);
