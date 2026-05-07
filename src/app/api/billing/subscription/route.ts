import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { getSubscriptionStatus } from "@/lib/billing";
import { logServerError } from "@/lib/error-logger";

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const status = await getSubscriptionStatus(userId);
    return NextResponse.json(status);
  } catch (error) {
    logServerError("billing-subscription-get", error, { route: "/api/billing/subscription" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
