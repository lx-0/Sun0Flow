import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_PRESETS = 20;

// GET /api/presets — list current user presets
export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const presets = await prisma.generationPreset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ presets });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

// POST /api/presets — create a new preset
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { name, title, stylePrompt, lyricsPrompt, isInstrumental, customMode } = await request.json();

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "Name must be 100 characters or less", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (!stylePrompt?.trim() && !lyricsPrompt?.trim()) {
      return NextResponse.json(
        { error: "At least one of style or lyrics must be set", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const count = await prisma.generationPreset.count({ where: { userId } });
    if (count >= MAX_PRESETS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_PRESETS} presets reached. Delete one to create a new one.`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const preset = await prisma.generationPreset.create({
      data: {
        userId,
        name: name.trim(),
        title: title?.trim() || null,
        stylePrompt: stylePrompt?.trim() || null,
        lyricsPrompt: lyricsPrompt?.trim() || null,
        isInstrumental: Boolean(isInstrumental),
        customMode: Boolean(customMode),
      },
    });

    return NextResponse.json({ preset }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
