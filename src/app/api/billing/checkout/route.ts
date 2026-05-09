import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { createCheckoutSession } from "@/lib/billing";

export const POST = authRoute(async (_request, { auth, body }) => {
  const result = await createCheckoutSession(auth.userId, body.tier);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({ url: result.url });
}, {
  route: "/api/billing/checkout",
  body: z.object({ tier: z.string() }),
});
