import { NextResponse } from "next/server";
import { cronRoute } from "@/lib/route-handler";
import { processAutoGenerateFeeds } from "@/lib/rss/auto-generate";

export const POST = cronRoute(async () => {
  const result = await processAutoGenerateFeeds();
  return NextResponse.json(result);
});
