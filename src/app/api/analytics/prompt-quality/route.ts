import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { getPromptQuality } from "@/lib/analytics-data";

export const GET = adminRoute(async (request) => {
  const range = request.nextUrl.searchParams.get("range") || "30d";
  const data = await getPromptQuality(range);
  return NextResponse.json(data);
});
