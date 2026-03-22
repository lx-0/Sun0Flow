import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

const MAX_TAGS_PER_USER = 30;

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const tags = await prisma.tag.findMany({
      where: { userId: userId },
      include: { _count: { select: { songTags: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ tags });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
    const color = typeof body.color === "string" ? body.color.trim() : "#7c3aed";

    if (!name || name.length > 50) {
      return NextResponse.json({ error: "Tag name is required (max 50 chars)" }, { status: 400 });
    }

    // Check user tag limit
    const count = await prisma.tag.count({ where: { userId: userId } });
    if (count >= MAX_TAGS_PER_USER) {
      return NextResponse.json({ error: `Maximum ${MAX_TAGS_PER_USER} tags allowed` }, { status: 400 });
    }

    // Check for duplicate
    const existing = await prisma.tag.findUnique({
      where: { userId_name: { userId: userId, name } },
    });
    if (existing) {
      return NextResponse.json({ tag: existing });
    }

    const tag = await prisma.tag.create({
      data: { name, color, userId: userId },
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
