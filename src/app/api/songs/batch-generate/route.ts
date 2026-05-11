import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { executeBatchGeneration } from "@/lib/generation";

const bodySchema = z.object({ configs: z.unknown() });

export const POST = authRoute(async (_request, { auth, body }) => {
  const result = await executeBatchGeneration(auth.userId, body.configs);

  if (!result.ok) return resultResponse(result);

  return NextResponse.json(result.data, { status: 201 });
}, {
  route: "/api/songs/batch-generate",
  body: bodySchema,
});
