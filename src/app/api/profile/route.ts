import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getProfile, updateProfile, deleteAccount } from "@/lib/profile";

export const GET = authRoute(async (_request, { auth }) => {
  const result = await getProfile(auth.userId);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data);
}, { route: "/api/profile" });

export const PATCH = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const result = await updateProfile(auth.userId, body);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data);
}, { route: "/api/profile" });

export const DELETE = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const result = await deleteAccount(auth.userId, body);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data);
}, { route: "/api/profile" });
