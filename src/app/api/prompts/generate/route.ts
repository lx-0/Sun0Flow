import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { generatePromptsFromFeeds } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(req);
    if (authError) return authError;

    let boost = false;
    try {
      const body = await req.json();
      boost = Boolean(body?.boost);
    } catch {
      // No body or invalid JSON — defaults apply
    }

    const result = await generatePromptsFromFeeds(userId!, { boost });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    return NextResponse.json({ prompts: result.prompts });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
