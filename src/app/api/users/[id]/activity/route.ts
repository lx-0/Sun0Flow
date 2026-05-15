import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/lib/route-handler";
import { notFound } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { queryPublicActivities } from "@/lib/activity";

const activityQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

export const GET = publicRoute<{ id: string }, undefined, z.infer<typeof activityQuery>>(
  async (_request, { params, query }) => {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!user) {
      return notFound("User not found");
    }

    const result = await queryPublicActivities([params.id], query.page);
    return NextResponse.json(result);
  },
  { route: "/api/users/[id]/activity", query: activityQuery },
);
