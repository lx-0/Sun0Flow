import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { getMonthlyCreditUsage } from "@/lib/credits";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  try {
    const usage = await getMonthlyCreditUsage(userId);
    return NextResponse.json(usage);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch credit usage" },
      { status: 500 }
    );
  }
}
