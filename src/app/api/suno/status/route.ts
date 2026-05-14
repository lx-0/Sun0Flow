import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { resolveUserApiKey, getRemainingCredits, SunoApiError } from "@/lib/sunoapi";
import { mapSunoApiError } from "@/lib/suno-api-error";

export const GET = authRoute(async (_request, { auth }) => {
  const apiKey = await resolveUserApiKey(auth.userId);

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
    if (err instanceof SunoApiError) {
      return mapSunoApiError(err, {
        fallbackMessage: "Failed to check Suno connection",
      });
    }
    return NextResponse.json({ error: "Failed to check Suno connection", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}, { route: "/api/suno/status" });
