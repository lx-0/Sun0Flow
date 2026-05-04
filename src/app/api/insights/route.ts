import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { getInsights } from "@/lib/insights";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  try {
    const insights = await getInsights(userId);
    return NextResponse.json(insights);
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
