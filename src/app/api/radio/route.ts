import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { curateRadio } from "@/lib/radio";
import { logServerError } from "@/lib/error-logger";
import { CacheControl } from "@/lib/cache";
import { internalError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const p = request.nextUrl.searchParams;
    const limitParam = parseInt(p.get("limit") || "", 10);
    const tempoMin = parseInt(p.get("tempoMin") || "", 10);
    const tempoMax = parseInt(p.get("tempoMax") || "", 10);

    const result = await curateRadio({
      userId,
      mood: p.get("mood") || undefined,
      genre: p.get("genre") || undefined,
      tempoMin: !isNaN(tempoMin) && tempoMin > 0 ? tempoMin : undefined,
      tempoMax: !isNaN(tempoMax) && tempoMax > 0 ? tempoMax : undefined,
      excludeIds:
        p
          .get("excludeIds")
          ?.split(",")
          .map((id) => id.trim())
          .filter(Boolean) || [],
      seedSongId: p.get("seedSongId")?.trim() || undefined,
      limit:
        !isNaN(limitParam) && limitParam >= 1 && limitParam <= 50
          ? limitParam
          : 20,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.privateNoCache },
    });
  } catch (error) {
    logServerError("radio", error, { route: "/api/radio" });
    return internalError();
  }
}
