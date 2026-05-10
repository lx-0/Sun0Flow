import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { badRequest } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const MAX_PRESETS = 20;

export const GET = authRoute(async (_request, { auth }) => {
  const presets = await prisma.generationPreset.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ presets });
});

const createPresetBody = z.object({
  name: z.string().min(1, "Name is required").max(100),
  title: z.string().nullish(),
  stylePrompt: z.string().nullish(),
  lyricsPrompt: z.string().nullish(),
  isInstrumental: z.boolean().optional().default(false),
  customMode: z.boolean().optional().default(false),
});

export const POST = authRoute(async (_request, { auth, body }) => {
  if (!body.stylePrompt?.trim() && !body.lyricsPrompt?.trim()) {
    return badRequest("At least one of style or lyrics must be set");
  }

  const count = await prisma.generationPreset.count({ where: { userId: auth.userId } });
  if (count >= MAX_PRESETS) {
    return badRequest(`Maximum of ${MAX_PRESETS} presets reached. Delete one to create a new one.`);
  }

  const preset = await prisma.generationPreset.create({
    data: {
      userId: auth.userId,
      name: body.name.trim(),
      title: body.title?.trim() || null,
      stylePrompt: body.stylePrompt?.trim() || null,
      lyricsPrompt: body.lyricsPrompt?.trim() || null,
      isInstrumental: body.isInstrumental,
      customMode: body.customMode,
    },
  });

  return NextResponse.json({ preset }, { status: 201 });
}, { body: createPresetBody });
