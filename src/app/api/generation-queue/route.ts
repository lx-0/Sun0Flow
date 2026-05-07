import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { listItems, addItem } from "@/lib/generation-queue";

export async function GET(request: Request) {
  const { userId, error } = await resolveUser(request);
  if (error) return error;

  const items = await listItems(userId);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const { userId, error } = await resolveUser(request);
  if (error) return error;

  const { prompt, title, tags, makeInstrumental, personaId } =
    await request.json();

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json(
      { error: "A prompt is required", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  if (prompt.length > 3000) {
    return NextResponse.json(
      { error: "Prompt must be 3000 characters or less", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const result = await addItem(userId, { prompt, title, tags, makeInstrumental, personaId });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ item: result.item }, { status: 201 });
}
