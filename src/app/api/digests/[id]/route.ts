import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const GET = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { data: digest, error } = requireOwned(
      await prisma.inspirationDigest.findUnique({
        where: { id: params.id },
        select: { id: true, userId: true, title: true, items: true, createdAt: true },
      }),
      auth.userId,
      "Digest",
    );
    if (error) return error;

    return NextResponse.json({ digest });
  },
  { route: "/api/digests/[id]" },
);
