import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { cancelItem } from "@/lib/generation-queue";
import { notFound } from "@/lib/api-error";

export const DELETE = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const result = await cancelItem(auth.userId, params.id);

    if (!result.ok) {
      return notFound("Not found");
    }

    return NextResponse.json({ success: true });
  },
  {
    route: "/api/generation-queue/[id]",
  }
);
