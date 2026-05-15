import { NextResponse } from "next/server";
import { cronRoute } from "@/lib/route-handler";
import { refreshStalePlaylists } from "@/lib/smart-playlists";
import { logger } from "@/lib/logger";

export const POST = cronRoute(async () => {
  const { refreshed, skipped } = await refreshStalePlaylists();

  logger.info(
    { refreshed, skipped },
    "refresh-smart-playlists: cron run complete"
  );

  return NextResponse.json({ refreshed, skipped });
});
