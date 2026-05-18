import { authRoute } from "@/lib/route-handler";
import { createPortalSession } from "@/lib/billing";
import { respondWithResult } from "@/lib/billing/http";

export const POST = authRoute(async (_request, { auth }) => {
  const result = await createPortalSession(auth.userId);
  return respondWithResult(result, ({ url }) => ({ url }));
}, { route: "/api/billing/portal" });
