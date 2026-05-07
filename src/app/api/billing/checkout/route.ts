import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { createCheckoutSession } from "@/lib/billing";
import { logServerError } from "@/lib/error-logger";

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { tier } = (await request.json()) as { tier: string };
    const result = await createCheckoutSession(userId, tier);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: result.status },
      );
    }

    return NextResponse.json({ url: result.url });
  } catch (error) {
    logServerError("billing-checkout-post", error, { route: "/api/billing/checkout" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
