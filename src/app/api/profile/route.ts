import { authRoute, resultResponse } from "@/lib/route-handler";
import { getProfile, updateProfile, deleteAccount } from "@/lib/profile";

export const GET = authRoute(async (_request, { auth }) => {
  return resultResponse(await getProfile(auth.userId));
}, { route: "/api/profile" });

export const PATCH = authRoute(async (request, { auth }) => {
  const body = await request.json();
  return resultResponse(await updateProfile(auth.userId, body));
}, { route: "/api/profile" });

export const DELETE = authRoute(async (request, { auth }) => {
  const body = await request.json();
  return resultResponse(await deleteAccount(auth.userId, body));
}, { route: "/api/profile" });
