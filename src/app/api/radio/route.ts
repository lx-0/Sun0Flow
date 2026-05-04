import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { curateRadio } from "@/lib/radio";
import { CacheControl } from "@/lib/cache";

export const GET = authRoute(async (request, { auth }) => {
  const p = request.nextUrl.searchParams;
  const limitParam = parseInt(p.get("limit") || "", 10);
  const tempoMin = parseInt(p.get("tempoMin") || "", 10);
  const tempoMax = parseInt(p.get("tempoMax") || "", 10);

  const result = await curateRadio({
    userId: auth.userId,
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
}, { route: "/api/radio" });
