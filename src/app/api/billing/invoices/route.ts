import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getInvoices } from "@/lib/billing";

export const GET = authRoute(async (_request, { auth }) => {
  const invoices = await getInvoices(auth.userId);
  return NextResponse.json({ invoices });
}, { route: "/api/billing/invoices" });
