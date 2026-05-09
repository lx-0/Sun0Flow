import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { getRemainingCredits } from "@/lib/sunoapi/status";
import { SunoApiError } from "@/lib/sunoapi/errors";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const apiKey = await resolveUserApiKey(userId);

  if (!apiKey) {
    return NextResponse.json({ connected: false });
  }

  try {
    const remaining = await getRemainingCredits(apiKey);
    return NextResponse.json({
      connected: true,
      credits: { remaining },
      validatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof SunoApiError && err.status === 401) {
      return NextResponse.json({ connected: false, error: "Invalid API key" });
    }
    return NextResponse.json(
      { error: "Failed to check Suno connection", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
