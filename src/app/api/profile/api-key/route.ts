import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { buildApiKeyUpdateData, toApiKeyResponse } from "@/lib/profile/api-key";

const updateApiKeySchema = z
  .object({
    sunoApiKey: z.string().optional(),
    usePersonalApiKey: z.boolean().optional(),
  })
  .refine(
    (value) => value.sunoApiKey !== undefined || value.usePersonalApiKey !== undefined,
    { message: "Provide sunoApiKey or usePersonalApiKey" },
  );

export const GET = authRoute(async (_request, { auth }) => {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { sunoApiKey: true, usePersonalApiKey: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(toApiKeyResponse(user));
}, { route: "/api/profile/api-key" });

export const PATCH = authRoute(async (_request, { auth, body }) => {
  const updateData = buildApiKeyUpdateData(body);

  const updated = await prisma.user.update({
    where: { id: auth.userId },
    data: updateData,
    select: { sunoApiKey: true, usePersonalApiKey: true },
  });

  return NextResponse.json(toApiKeyResponse(updated));
}, {
  route: "/api/profile/api-key",
  body: updateApiKeySchema,
});
