import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_TAGS_PER_USER = 30;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tags = await prisma.tag.findMany({
      where: { userId: session.user.id },
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
    const color = typeof body.color === "string" ? body.color.trim() : "#7c3aed";

    if (!name || name.length > 50) {
      return NextResponse.json({ error: "Tag name is required (max 50 chars)" }, { status: 400 });
    }

    // Check user tag limit
    const count = await prisma.tag.count({ where: { userId: session.user.id } });
    if (count >= MAX_TAGS_PER_USER) {
      return NextResponse.json({ error: `Maximum ${MAX_TAGS_PER_USER} tags allowed` }, { status: 400 });
    }

    // Check for duplicate
    const existing = await prisma.tag.findUnique({
      where: { userId_name: { userId: session.user.id, name } },
    });
    if (existing) {
      return NextResponse.json({ tag: existing });
    }

    const tag = await prisma.tag.create({
      data: { name, color, userId: session.user.id },
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
