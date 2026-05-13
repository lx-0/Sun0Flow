import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, notFound } from "@/lib/api-error";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

const patchTemplateSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Name cannot be empty")
    .max(100, "Name must be 100 characters or less")
    .optional(),
  tags: z.string()
    .trim()
    .min(1, "Tags cannot be empty")
    .max(500, "Tags must be 500 characters or less")
    .optional(),
}).refine(
  (data) => data.name !== undefined || data.tags !== undefined,
  { message: "No fields to update" },
);

export const PATCH = authRoute<{ id: string }, z.infer<typeof patchTemplateSchema>>(async (_request, { auth, params, body }) => {
  const template = await prisma.styleTemplate.findFirst({
    where: { id: params.id, userId: auth.userId },
  });

  if (!template) {
    return notFound("Not found");
  }

  const data: { name?: string; tags?: string } = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.tags !== undefined) data.tags = body.tags;

  if (Object.keys(data).length === 0) {
    return badRequest("No fields to update");
  }

  const updated = await prisma.styleTemplate.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ template: updated });
}, {
  route: "/api/style-templates/[id]",
  body: patchTemplateSchema,
});

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const template = await prisma.styleTemplate.findFirst({
    where: { id: params.id, userId: auth.userId },
  });

  if (!template) {
    return notFound("Not found");
  }

  await prisma.styleTemplate.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}, {
  route: "/api/style-templates/[id]",
});
