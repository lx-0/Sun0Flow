import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getSubscriptionStatus } from "@/lib/billing";

export const GET = authRoute(async (_request, { auth }) => {
  const status = await getSubscriptionStatus(auth.userId);
  return NextResponse.json(status);
}, { route: "/api/billing/subscription" });
