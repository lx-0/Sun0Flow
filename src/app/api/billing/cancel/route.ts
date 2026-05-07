import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { cancelSubscription } from "@/lib/billing";
import { logServerError } from "@/lib/error-logger";

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : undefined;

    const result = await cancelSubscription(userId, reason);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: result.status },
      );
    }

    return NextResponse.json({ success: true, cancelAtPeriodEnd: true });
  } catch (error) {
    logServerError("billing-cancel-post", error, { route: "/api/billing/cancel" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
