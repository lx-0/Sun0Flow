import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { createCheckoutSession } from "@/lib/billing";
import { respondWithResult } from "@/lib/billing/http";

export const POST = authRoute(async (_request, { auth, body }) => {
  const result = await createCheckoutSession(auth.userId, body.tier);
  return respondWithResult(result, ({ url }) => ({ url }));
}, {
  route: "/api/billing/checkout",
  body: z.object({ tier: z.string() }),
});
