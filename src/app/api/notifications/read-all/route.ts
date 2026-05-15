import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { markAllRead } from "@/lib/notifications";

export const PATCH = authRoute(async (_request, { auth }) => {
  await markAllRead(auth.userId);

  return NextResponse.json({ ok: true });
}, { route: "/api/notifications/read-all" });
