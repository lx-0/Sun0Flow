import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { status } = await checkRateLimit(userId);
    return NextResponse.json(status);
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
