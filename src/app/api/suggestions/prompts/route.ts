import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { CacheControl } from "@/lib/cache";
import { getPromptSuggestions } from "@/lib/suggestions";

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const suggestions = await getPromptSuggestions(userId);

    const response = NextResponse.json({ suggestions });
    response.headers.set("Cache-Control", CacheControl.privateShort);
    return response;
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
