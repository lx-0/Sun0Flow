import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { createPortalSession } from "@/lib/billing";

export const POST = authRoute(async (_request, { auth }) => {
  const result = await createPortalSession(auth.userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({ url: result.url });
}, { route: "/api/billing/portal" });
