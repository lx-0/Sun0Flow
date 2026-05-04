import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { markRead } from "@/lib/notifications";
import { notFound } from "@/lib/api-error";

export const PATCH = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const result = await markRead(auth.userId, params.id);

  if (result.notFound) return notFound();

  return NextResponse.json({ ok: true });
}, { route: "/api/notifications/[id]/read" });
