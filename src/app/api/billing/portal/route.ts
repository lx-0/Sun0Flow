import { NextResponse } from "next/server";
import { errorFromResult } from "@/lib/api-error";
import { authRoute } from "@/lib/route-handler";
import { createPortalSession } from "@/lib/billing";

export const POST = authRoute(async (_request, { auth }) => {
  const result = await createPortalSession(auth.userId);

  if (!result.ok) {
    return errorFromResult(result);
  }

  return NextResponse.json({ url: result.url });
}, { route: "/api/billing/portal" });
