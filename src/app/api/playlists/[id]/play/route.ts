import { NextRequest } from "next/server";
import { resultResponse } from "@/lib/route-handler";
import { logServerError } from "@/lib/error-logger";
import { internalError } from "@/lib/api-error";
import { recordPlay } from "@/lib/playlists";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return resultResponse(await recordPlay(id));
  } catch (error) {
    logServerError("playlist-play", error, { route: "/api/playlists/[id]/play" });
    return internalError();
  }
}
