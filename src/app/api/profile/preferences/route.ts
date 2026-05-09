import { authRoute, resultResponse } from "@/lib/route-handler";
import { getPreferences, updatePreferences } from "@/lib/profile";

export const GET = authRoute(async (_request, { auth }) => {
  return resultResponse(await getPreferences(auth.userId));
}, { route: "/api/profile/preferences" });

export const PATCH = authRoute(async (request, { auth }) => {
  const body = await request.json();
  return resultResponse(await updatePreferences(auth.userId, body));
}, { route: "/api/profile/preferences" });
