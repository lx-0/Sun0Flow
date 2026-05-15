import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

const patchBody = z.object({
  autoGenerate: z.boolean({ error: "autoGenerate (boolean) is required" }),
});

export const PATCH = authRoute<{ id: string }, z.infer<typeof patchBody>>(
  async (_request, { auth, params, body }) => {
    const { data: feed, error } = requireOwned(
      await prisma.rssFeedSubscription.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Feed",
    );
    if (error) return error;

    const updated = await prisma.rssFeedSubscription.update({
      where: { id: feed.id },
      data: { autoGenerate: body.autoGenerate },
      select: { id: true, url: true, title: true, autoGenerate: true, createdAt: true },
    });

    return NextResponse.json({ feed: updated });
  },
  { body: patchBody, route: "/api/rss/feeds/[id]" },
);
