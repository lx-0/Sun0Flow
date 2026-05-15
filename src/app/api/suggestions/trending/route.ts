import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { CacheControl } from "@/lib/cache";
import { getTrendingCombos } from "@/lib/suggestions";

export const GET = authRoute(async () => {
  const trending = await getTrendingCombos();
  return NextResponse.json({ trending }, {
    headers: { "Cache-Control": CacheControl.privateShort },
  });
});
