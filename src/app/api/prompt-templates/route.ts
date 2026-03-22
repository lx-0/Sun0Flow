import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

const MAX_USER_TEMPLATES = 20;

// GET /api/prompt-templates — list built-in + user templates
// Optional query param: ?category=pop (filter by category)
export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {
      OR: [{ isBuiltIn: true }, { userId: userId }],
    };
    if (category) {
      where.category = category;
    }
    if (search) {
      where.AND = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { prompt: { contains: search, mode: "insensitive" } },
          { category: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const templates = await prisma.promptTemplate.findMany({
      where,
      orderBy: [{ isBuiltIn: "desc" }, { category: "asc" }, { createdAt: "asc" }],
    });

    // Also return the distinct categories for the filter UI
    const categories = await prisma.promptTemplate.findMany({
      where: {
        OR: [{ isBuiltIn: true }, { userId: userId }],
        category: { not: null },
      },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });

    return NextResponse.json({
      templates,
      categories: categories.map((c) => c.category),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/prompt-templates — create a user template
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { name, prompt, style, category, description, isInstrumental } = await request.json();

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Enforce max 20 user templates
    const count = await prisma.promptTemplate.count({
      where: { userId, isBuiltIn: false },
    });
    if (count >= MAX_USER_TEMPLATES) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_USER_TEMPLATES} templates reached. Delete one to create a new one.` },
        { status: 400 }
      );
    }

    const template = await prisma.promptTemplate.create({
      data: {
        userId,
        name: name.trim(),
        prompt: prompt.trim(),
        style: style?.trim() || null,
        category: category?.trim() || null,
        description: description?.trim() || null,
        isInstrumental: Boolean(isInstrumental),
        isBuiltIn: false,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
