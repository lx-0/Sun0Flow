import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { getInvoices } from "@/lib/billing";
import { logServerError } from "@/lib/error-logger";

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const invoices = await getInvoices(userId);
    return NextResponse.json({ invoices });
  } catch (error) {
    logServerError("billing-invoices-get", error, { route: "/api/billing/invoices" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
