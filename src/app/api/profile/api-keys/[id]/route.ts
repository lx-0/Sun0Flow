import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authRoute } from "@/lib/route-handler";
import { notFound } from "@/lib/api-error";

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: params.id,
      userId: auth.userId,
      revokedAt: null,
    },
  });

  if (!apiKey) {
    return notFound("API key not found");
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ success: true });
});
