import { NextResponse } from "next/server";
import { z } from "zod";
import { errorFromResult } from "@/lib/api-error";
import { authRoute } from "@/lib/route-handler";
import { cancelSubscription } from "@/lib/billing";

export const POST = authRoute(async (_request, { auth, body }) => {
  const result = await cancelSubscription(auth.userId, body.reason);

  if (!result.ok) {
    return errorFromResult(result);
  }

  return NextResponse.json({ success: true, cancelAtPeriodEnd: true });
}, {
  route: "/api/billing/cancel",
  body: z.object({
    reason: z.string().optional().transform((value) => value?.slice(0, 500)),
  }),
});
