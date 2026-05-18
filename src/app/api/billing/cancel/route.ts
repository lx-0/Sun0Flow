import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { cancelSubscription } from "@/lib/billing";
import { respondWithResult } from "@/lib/billing/http";

export const POST = authRoute(async (_request, { auth, body }) => {
  const result = await cancelSubscription(auth.userId, body.reason);
  return respondWithResult(result, () => ({
    success: true,
    cancelAtPeriodEnd: true,
  }));
}, {
  route: "/api/billing/cancel",
  body: z.object({
    reason: z.string().optional().transform((value) => value?.slice(0, 500)),
  }),
});
