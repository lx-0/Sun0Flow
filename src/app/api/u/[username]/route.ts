import { NextResponse } from "next/server";
import { optionalAuthRoute } from "@/lib/route-handler";
import { errorFromResult } from "@/lib/api-error";
import { getPublicUserProfileByUsername } from "@/lib/profile";

export const GET = optionalAuthRoute<{ username: string }>(async (_request, { auth, params }) => {
  const result = await getPublicUserProfileByUsername(params.username, auth.userId);
  if (!result.ok) return errorFromResult(result);
  return NextResponse.json(result.data);
}, { route: "/api/u/[username]" });
