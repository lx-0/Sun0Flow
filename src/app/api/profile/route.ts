import { authRoute, resultResponse } from "@/lib/route-handler";
import { getProfile, updateProfile, deleteAccount } from "@/lib/profile";
import { z } from "zod";

const updateProfileBody = z.object({
  name: z.string().optional(),
  bio: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  featuredSongId: z.string().nullable().optional(),
});

const deleteAccountBody = z.object({
  password: z.string(),
  confirmEmail: z.string(),
});

export const GET = authRoute(async (_request, { auth }) => {
  return resultResponse(await getProfile(auth.userId));
}, { route: "/api/profile" });

export const PATCH = authRoute(async (_request, { auth, body }) => {
  return resultResponse(await updateProfile(auth.userId, body));
}, { route: "/api/profile", body: updateProfileBody });

export const DELETE = authRoute(async (_request, { auth, body }) => {
  return resultResponse(await deleteAccount(auth.userId, body));
}, { route: "/api/profile", body: deleteAccountBody });
