import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { Tags } from "@/lib/tags";
import { z } from "zod";

const updateTagBody = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
});

export const PATCH = authRoute<{ id: string }, z.infer<typeof updateTagBody>>(async (_request, { auth, params, body }) => {
  const result = await Tags.update(auth.userId, params.id, {
    name: body.name,
    color: body.color,
  });
  if (!result.ok) return resultResponse(result);
  return NextResponse.json({ tag: result.data });
}, { route: "/api/tags/[id]", body: updateTagBody });

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const result = await Tags.remove(auth.userId, params.id);
  if (!result.ok) return resultResponse(result);
  return NextResponse.json({ success: true });
}, { route: "/api/tags/[id]" });
