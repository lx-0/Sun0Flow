import { NextResponse } from "next/server";
import { CacheControl } from "@/lib/cache";
import { authRoute } from "@/lib/route-handler";
import { querySongLibrary } from "@/lib/songs";
import { songsQuerySchema } from "@/lib/songs/request";
import { kickoffStalePendingRecovery } from "@/lib/songs/stale-pending-recovery";

export const GET = authRoute(
  async (_request, { auth, query }) => {
    // Lazy-trigger recovery sweep: stuck pending songs (15min+) get
    // re-probed against Suno in the background, independent of the
    // library read below. Fire-and-forget — errors land in GlitchTip.
    kickoffStalePendingRecovery(auth.userId);

    const result = await querySongLibrary({ userId: auth.userId, ...query });

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.privateNoCache },
    });
  },
  { route: "/api/songs", query: songsQuerySchema },
);
