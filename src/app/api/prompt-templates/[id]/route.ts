import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { updateTemplate, deleteTemplate } from "@/lib/prompt-templates";
import { z } from "zod";

const updateTemplateBody = z.object({
  name: z.unknown().optional(),
  prompt: z.unknown().optional(),
  style: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  isInstrumental: z.boolean().optional(),
});

export const PATCH = authRoute<{ id: string }, z.infer<typeof updateTemplateBody>>(async (_request, { auth, params, body }) => {
  const result = await updateTemplate(auth.userId, params.id, body);
  if (!result.ok) return resultResponse(result);
  return NextResponse.json({ template: result.data });
}, { route: "/api/prompt-templates/[id]", body: updateTemplateBody });

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await deleteTemplate(auth.userId, params.id));
}, { route: "/api/prompt-templates/[id]" });
