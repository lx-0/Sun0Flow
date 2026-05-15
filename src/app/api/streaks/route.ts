import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getUserStreak } from "@/lib/streaks";

export const GET = authRoute(async (_request, { auth }) => {
  const streak = await getUserStreak(auth.userId);
  return NextResponse.json({ streak });
}, { route: "/api/streaks" });
