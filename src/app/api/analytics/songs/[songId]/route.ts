import { authRoute, resultResponse } from "@/lib/route-handler";
import { getSongAnalytics } from "@/lib/analytics-data";

export const GET = authRoute<{ songId: string }>(async (_request, { auth, params }) => {
  return resultResponse(await getSongAnalytics(auth.userId, params.songId));
});
