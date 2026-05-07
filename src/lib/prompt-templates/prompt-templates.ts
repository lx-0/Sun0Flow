import { prisma } from "@/lib/prisma";
import { success, Err } from "./result";

const MAX_USER_TEMPLATES = 20;

export interface ListTemplatesInput {
  category?: string | null;
  search?: string | null;
}

export async function listTemplates(userId: string, input: ListTemplatesInput) {
  const where: Record<string, unknown> = {
    OR: [{ isBuiltIn: true }, { userId }],
  };
  if (input.category) {
    where.category = input.category;
  }
  if (input.search) {
    where.AND = {
      OR: [
        { name: { contains: input.search, mode: "insensitive" } },
        { description: { contains: input.search, mode: "insensitive" } },
        { prompt: { contains: input.search, mode: "insensitive" } },
        { category: { contains: input.search, mode: "insensitive" } },
      ],
    };
  }

  const templates = await prisma.promptTemplate.findMany({
    where,
    orderBy: [{ isBuiltIn: "desc" }, { category: "asc" }, { createdAt: "asc" }],
  });

  const categories = await prisma.promptTemplate.findMany({
    where: {
      OR: [{ isBuiltIn: true }, { userId }],
      category: { not: null },
    },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });

  return success({
    templates,
    categories: categories.map((c) => c.category),
  });
}

export interface CreateTemplateInput {
  name: unknown;
  prompt: unknown;
  style?: string;
  category?: string;
  description?: string;
  isInstrumental?: boolean;
}

export async function createTemplate(userId: string, input: CreateTemplateInput) {
  if (!input.name || typeof input.name !== "string" || !input.name.trim()) {
    return Err.validation("Name is required");
  }
  if (input.name.length > 100) {
    return Err.validation("Name must be 100 characters or less");
  }
  if (!input.prompt || typeof input.prompt !== "string" || !input.prompt.trim()) {
    return Err.validation("Prompt is required");
  }
  if (input.prompt.length > 3000) {
    return Err.validation("Prompt must be 3000 characters or less");
  }
  if (input.description && typeof input.description === "string" && input.description.length > 500) {
    return Err.validation("Description must be 500 characters or less");
  }

  const count = await prisma.promptTemplate.count({
    where: { userId, isBuiltIn: false },
  });
  if (count >= MAX_USER_TEMPLATES) {
    return Err.validation(
      `Maximum of ${MAX_USER_TEMPLATES} templates reached. Delete one to create a new one.`,
    );
  }

  const template = await prisma.promptTemplate.create({
    data: {
      userId,
      name: input.name.trim(),
      prompt: input.prompt.trim(),
      style: input.style?.trim() || null,
      category: input.category?.trim() || null,
      description: input.description?.trim() || null,
      isInstrumental: Boolean(input.isInstrumental),
      isBuiltIn: false,
    },
  });

  return success(template);
}

export interface UpdateTemplateInput {
  name?: unknown;
  prompt?: unknown;
  style?: string;
  category?: string;
  description?: string;
  isInstrumental?: boolean;
}

export async function updateTemplate(
  userId: string,
  templateId: string,
  input: UpdateTemplateInput,
) {
  const template = await prisma.promptTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) return Err.notFound("Template not found");
  if (template.isBuiltIn) return Err.forbidden("Cannot edit built-in templates");
  if (template.userId !== userId) return Err.forbidden("Forbidden");

  const data: Record<string, unknown> = {};

  if (input.name !== undefined) {
    if (!input.name || typeof input.name !== "string" || !input.name.trim()) {
      return Err.validation("Name is required");
    }
    data.name = input.name.trim();
  }
  if (input.prompt !== undefined) {
    if (!input.prompt || typeof input.prompt !== "string" || !input.prompt.trim()) {
      return Err.validation("Prompt is required");
    }
    data.prompt = input.prompt.trim();
  }
  if (input.style !== undefined) data.style = input.style?.trim() || null;
  if (input.category !== undefined) data.category = input.category?.trim() || null;
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.isInstrumental !== undefined) data.isInstrumental = Boolean(input.isInstrumental);

  const updated = await prisma.promptTemplate.update({
    where: { id: templateId },
    data,
  });

  return success(updated);
}

export async function deleteTemplate(userId: string, templateId: string) {
  const template = await prisma.promptTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) return Err.notFound("Template not found");
  if (template.isBuiltIn) return Err.forbidden("Cannot delete built-in templates");
  if (template.userId !== userId) return Err.forbidden("Forbidden");

  await prisma.promptTemplate.delete({ where: { id: templateId } });

  return success({ success: true as const });
}
