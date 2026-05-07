import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { createTopupSession, getTopupHistory } from "@/lib/billing";
import { logServerError } from "@/lib/error-logger";

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { package: pkg } = (await request.json()) as { package: string };
    const result = await createTopupSession(userId, pkg);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: result.status },
      );
    }

    return NextResponse.json({ url: result.url });
  } catch (error) {
    logServerError("billing-topup-post", error, { route: "/api/billing/topup" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const topUps = await getTopupHistory(userId);
    return NextResponse.json({ topUps });
  } catch (error) {
    logServerError("billing-topup-get", error, { route: "/api/billing/topup" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
