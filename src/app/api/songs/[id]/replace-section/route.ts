import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { logServerError } from "@/lib/error-logger";
import { respondToGeneration } from "@/lib/generation";
import { replaceSection } from "@/lib/song-variations";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;
    const { id: songId } = await params;
    const body = await request.json();

    const outcome = await replaceSection(userId, songId, {
      prompt: body.prompt,
      tags: body.tags,
      title: body.title,
      infillStartS: body.infillStartS,
      infillEndS: body.infillEndS,
      negativeTags: body.negativeTags,
    });

    if (outcome.status === "not_found") {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    if (outcome.status === "validation_error") {
      return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: 400 });
    }

    return respondToGeneration(outcome, { label: "replace-section-api", userId, route: `/api/songs/${songId}/replace-section` });
  } catch (error) {
    logServerError("replace-section-route", error, { route: "/api/songs/replace-section" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
