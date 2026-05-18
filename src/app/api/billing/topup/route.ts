import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { createTopupSession, getTopupHistory } from "@/lib/billing";
import { respondWithResult } from "@/lib/billing/http";

export const POST = authRoute(async (_request, { auth, body }) => {
  const result = await createTopupSession(auth.userId, body.package);
  return respondWithResult(result, ({ url }) => ({ url }));
}, {
  route: "/api/billing/topup",
  body: z.object({ package: z.string() }),
});

export const GET = authRoute(async (_request, { auth }) => {
  const topUps = await getTopupHistory(auth.userId);
  return NextResponse.json({ topUps });
}, { route: "/api/billing/topup" });
