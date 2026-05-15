import { NextResponse } from "next/server";
import { z } from "zod";
import { errorFromResult } from "@/lib/api-error";
import { authRoute } from "@/lib/route-handler";
import { createCheckoutSession } from "@/lib/billing";

export const POST = authRoute(async (_request, { auth, body }) => {
  const result = await createCheckoutSession(auth.userId, body.tier);

  if (!result.ok) {
    return errorFromResult(result);
  }

  return NextResponse.json({ url: result.url });
}, {
  route: "/api/billing/checkout",
  body: z.object({ tier: z.string() }),
});
