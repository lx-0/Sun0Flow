import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { cancelSubscription } from "@/lib/billing";

export const POST = authRoute(async (request, { auth }) => {
  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : undefined;

  const result = await cancelSubscription(auth.userId, reason);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({ success: true, cancelAtPeriodEnd: true });
}, { route: "/api/billing/cancel" });
