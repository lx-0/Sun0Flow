import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { logServerError } from "@/lib/error-logger";
import { respondToGeneration } from "@/lib/generation";
import { addInstrumental } from "@/lib/song-variations";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;
    const { id: parentId } = await params;
    const body = await request.json();

    const outcome = await addInstrumental(userId, parentId, {
      tags: body.tags,
      title: body.title,
    });

    if (outcome.status === "not_found") {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    if (outcome.status === "validation_error") {
      return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: 400 });
    }

    return respondToGeneration(outcome, { label: "add-instrumental-api", userId, route: `/api/songs/${parentId}/add-instrumental` });
  } catch (error) {
    logServerError("add-instrumental-route", error, { route: "/api/songs/add-instrumental" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
