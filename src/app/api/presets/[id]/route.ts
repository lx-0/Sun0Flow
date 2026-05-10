import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const preset = await prisma.generationPreset.findUnique({ where: { id: params.id } });
  const { error } = requireOwned(preset, auth.userId, "Preset");
  if (error) return error;

  await prisma.generationPreset.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
});
