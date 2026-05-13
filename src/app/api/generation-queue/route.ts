import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { listItems, addItem } from "@/lib/generation-queue";
import {
  GENERATION_PROMPT_MAX_LENGTH,
  GENERATION_PROMPT_MAX_MESSAGE,
  GENERATION_PROMPT_REQUIRED_MESSAGE,
  GENERATION_STYLE_MAX_LENGTH,
  GENERATION_TITLE_MAX_LENGTH,
} from "@/lib/generation/params";

export const GET = authRoute(async (_request, { auth }) => {
  const items = await listItems(auth.userId);
  return NextResponse.json({ items });
}, { route: "/api/generation-queue" });

export const POST = authRoute(async (_request, { auth, body }) => {
  const { prompt, title, tags, makeInstrumental, personaId } = body;

  const result = await addItem(auth.userId, { prompt, title, tags, makeInstrumental, personaId });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ item: result.item }, { status: 201 });
}, {
  route: "/api/generation-queue",
  body: z.object({
    prompt: z
      .string()
      .trim()
      .min(1, GENERATION_PROMPT_REQUIRED_MESSAGE)
      .max(GENERATION_PROMPT_MAX_LENGTH, GENERATION_PROMPT_MAX_MESSAGE),
    title: z.string().max(GENERATION_TITLE_MAX_LENGTH).optional(),
    tags: z.string().max(GENERATION_STYLE_MAX_LENGTH).optional(),
    makeInstrumental: z.boolean().optional(),
    personaId: z.string().optional(),
  }),
});
