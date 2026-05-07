import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { createPortalSession } from "@/lib/billing";
import { logServerError } from "@/lib/error-logger";

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const result = await createPortalSession(userId);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: result.status },
      );
    }

    return NextResponse.json({ url: result.url });
  } catch (error) {
    logServerError("billing-portal-post", error, { route: "/api/billing/portal" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
