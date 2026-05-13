import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { curateRadio } from "@/lib/radio";
import { CacheControl } from "@/lib/cache";
import { zCsvParam, zIntParam, zLimitParam, zTrimmedParam } from "@/lib/query-params";

const radioQuery = z.object({
  mood: zTrimmedParam,
  genre: zTrimmedParam,
  tempoMin: zIntParam,
  tempoMax: zIntParam,
  excludeIds: zCsvParam,
  seedSongId: zTrimmedParam,
  limit: zLimitParam(20, 50),
});

export const GET = authRoute<Record<string, never>, undefined, z.infer<typeof radioQuery>>(async (_request, { auth, query }) => {
  const { mood, genre, tempoMin, tempoMax, excludeIds, seedSongId, limit } = query;

  const result = await curateRadio({
    userId: auth.userId,
    mood: mood || undefined,
    genre: genre || undefined,
    tempoMin: tempoMin && tempoMin > 0 ? tempoMin : undefined,
    tempoMax: tempoMax && tempoMax > 0 ? tempoMax : undefined,
    excludeIds,
    seedSongId: seedSongId || undefined,
    limit,
  });

  return NextResponse.json(result, {
    headers: { "Cache-Control": CacheControl.privateNoCache },
  });
}, { route: "/api/radio", query: radioQuery });
