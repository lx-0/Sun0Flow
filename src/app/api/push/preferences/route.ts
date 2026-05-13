import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { notFound } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { PUSH_PREFERENCES_SELECT, toPushPreferencesResponse } from "@/lib/push-preferences";

const pushPreferencesPatchBody = z.object({
  pushGenerationComplete: z.boolean().optional(),
  pushNewFollower: z.boolean().optional(),
  pushSongComment: z.boolean().optional(),
}).refine(
  (data) =>
    data.pushGenerationComplete !== undefined
    || data.pushNewFollower !== undefined
    || data.pushSongComment !== undefined,
  "No fields to update",
);

// GET /api/push/preferences — return user's push notification preferences
export const GET = authRoute(async (_request, { auth }) => {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: PUSH_PREFERENCES_SELECT,
  });

  if (!user) {
    return notFound("User not found");
  }

  return NextResponse.json(toPushPreferencesResponse(user));
}, { route: "/api/push/preferences" });

// PATCH /api/push/preferences — update user's push notification preferences
export const PATCH = authRoute(async (_request, { auth, body }) => {
  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: body,
    select: PUSH_PREFERENCES_SELECT,
  });

  return NextResponse.json(toPushPreferencesResponse(user));
}, { route: "/api/push/preferences", body: pushPreferencesPatchBody });
