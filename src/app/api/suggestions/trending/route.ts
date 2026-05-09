import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { CacheControl } from "@/lib/cache";
import { getTrendingCombos } from "@/lib/suggestions";

export async function GET(request: Request) {
  try {
    const { error: authError } = await resolveUser(request);
    if (authError) return authError;

    const trending = await getTrendingCombos();

    const response = NextResponse.json({ trending });
    response.headers.set("Cache-Control", CacheControl.privateShort);
    return response;
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
