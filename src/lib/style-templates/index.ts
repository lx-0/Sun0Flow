import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Err, success, type Result } from "@/lib/result";

export const MAX_STYLE_TEMPLATES = 50;

export const createTemplateSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  tags: z.string()
    .trim()
    .min(1, "Tags are required")
    .max(500, "Tags must be 500 characters or less"),
  sourceSongId: z.string().optional(),
});

export const patchTemplateSchema = z.object({
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

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type PatchTemplateInput = z.infer<typeof patchTemplateSchema>;

export async function listStyleTemplates(userId: string) {
  return prisma.styleTemplate.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createStyleTemplate(
  userId: string,
  body: CreateTemplateInput,
) {
  const sourceSongId = body.sourceSongId?.trim() || null;

  if (sourceSongId) {
    const song = await prisma.song.findFirst({ where: { id: sourceSongId, userId } });
    if (!song) {
      return Err.notFound("Source song not found");
    }
  }

  const count = await prisma.styleTemplate.count({ where: { userId } });
  if (count >= MAX_STYLE_TEMPLATES) {
    return Err.limitReached(
      `Maximum of ${MAX_STYLE_TEMPLATES} style templates reached. Delete one to create a new one.`,
    );
  }

  const template = await prisma.styleTemplate.create({
    data: {
      userId,
      name: body.name,
      tags: body.tags,
      sourceSongId,
    },
  });

  return success({ template });
}

export async function updateStyleTemplate(
  userId: string,
  templateId: string,
  body: PatchTemplateInput,
): Promise<Result<{ template: Awaited<ReturnType<typeof prisma.styleTemplate.update>> }>> {
  const template = await prisma.styleTemplate.findFirst({
    where: { id: templateId, userId },
  });

  if (!template) {
    return Err.notFound("Not found");
  }

  const data: { name?: string; tags?: string } = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.tags !== undefined) data.tags = body.tags;

  if (Object.keys(data).length === 0) {
    return Err.validation("No fields to update");
  }

  const updated = await prisma.styleTemplate.update({
    where: { id: templateId },
    data,
  });

  return success({ template: updated });
}

export async function deleteStyleTemplate(userId: string, templateId: string) {
  const template = await prisma.styleTemplate.findFirst({
    where: { id: templateId, userId },
  });

  if (!template) {
    return Err.notFound("Not found");
  }

  await prisma.styleTemplate.delete({ where: { id: templateId } });

  return success({ success: true as const });
}
