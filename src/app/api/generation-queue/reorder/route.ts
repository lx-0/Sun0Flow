import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { reorderItems } from "@/lib/generation-queue";

const reorderBody = z.object({
  orderedIds: z.array(z.string()),
});

export const POST = authRoute<Record<string, never>, z.infer<typeof reorderBody>>(
  async (_request, { auth, body }) => {
    const { orderedIds } = body;

    await reorderItems(auth.userId, orderedIds);
    return NextResponse.json({ success: true });
  },
  {
    body: reorderBody,
    route: "/api/generation-queue/reorder",
  }
);
