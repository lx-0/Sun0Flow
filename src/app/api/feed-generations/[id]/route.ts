import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import {
  buildFeedGenerationPatchData,
  ensurePendingFeedGeneration,
} from "@/lib/feed-generations";

const patchBody = z.object({
  status: z.string().optional(),
  prompt: z.string().optional(),
  style: z.string().optional(),
});

export const PATCH = authRoute<{ id: string }, z.infer<typeof patchBody>>(
  async (_request, { auth, params, body }) => {
    const { data: item, error } = requireOwned(
      await prisma.pendingFeedGeneration.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Feed generation",
    );
    if (error) return error;

    const statusError = ensurePendingFeedGeneration(item, "updated");
    if (statusError) return statusError;

    const updateData = buildFeedGenerationPatchData(body);

    const updated = await prisma.pendingFeedGeneration.update({
      where: { id: params.id },
      data: updateData,
      select: { id: true, prompt: true, style: true, status: true },
    });

    return NextResponse.json({ item: updated });
  },
  { body: patchBody, route: "/api/feed-generations/[id]" },
);
