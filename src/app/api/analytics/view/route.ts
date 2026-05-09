import { resultResponse } from "@/lib/route-handler";
import { recordView } from "@/lib/analytics-data";
import { logServerError } from "@/lib/error-logger";
import { internalError } from "@/lib/api-error";

export async function POST(request: Request) {
  try {
    const { songId } = await request.json();
    return resultResponse(await recordView(songId), { status: 201 });
  } catch (error) {
    logServerError("POST /api/analytics/view", error, { route: "/api/analytics/view" });
    return internalError();
  }
}
