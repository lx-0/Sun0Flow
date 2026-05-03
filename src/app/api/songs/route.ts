import { NextResponse } from "next/server";
import { CacheControl } from "@/lib/cache";
import { authRoute } from "@/lib/route-handler";
import { querySongLibrary, type SortField } from "@/lib/songs";

export const GET = authRoute(async (request, { auth }) => {
  const p = request.nextUrl.searchParams;

  const tagId = p.get("tagId") || "";
  const tagIdsParam = p.get("tagIds") || "";
  const tagIds = tagIdsParam
    ? tagIdsParam.split(",").map((t) => t.trim()).filter(Boolean)
    : tagId
      ? [tagId]
      : [];

  const parseIntSafe = (v: string | null) => {
    const n = parseInt(v || "", 10);
    return isNaN(n) ? undefined : n;
  };

  const splitCsv = (v: string | null) =>
    v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const result = await querySongLibrary({
    userId: auth.userId,
    search: p.get("q")?.trim() || undefined,
    status: p.get("status") || undefined,
    minRating: parseIntSafe(p.get("minRating")),
    sortBy: (p.get("sortBy") || "newest") as SortField,
    sortDir: (p.get("sortDir") || undefined) as "asc" | "desc" | undefined,
    dateFrom: p.get("dateFrom") || undefined,
    dateTo: p.get("dateTo") || undefined,
    tagIds,
    genres: splitCsv(p.get("genre")),
    moods: splitCsv(p.get("mood")),
    tempoMin: parseIntSafe(p.get("tempoMin")),
    tempoMax: parseIntSafe(p.get("tempoMax")),
    smartFilter: p.get("smartFilter") || undefined,
    includeVariations: p.get("includeVariations") === "true",
    archived: p.get("archived") === "true",
    limit: parseIntSafe(p.get("limit")),
    cursor: p.get("cursor") || undefined,
  });

  return NextResponse.json(result, {
    headers: { "Cache-Control": CacheControl.privateNoCache },
  });
}, { route: "/api/songs" });
