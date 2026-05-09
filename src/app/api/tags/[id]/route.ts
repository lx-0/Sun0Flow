import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { Tags } from "@/lib/tags";

export const PATCH = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  const result = await Tags.update(auth.userId, params.id, {
    name: typeof body.name === "string" ? body.name : undefined,
    color: typeof body.color === "string" ? body.color : undefined,
  });
  if (!result.ok) return resultResponse(result);
  return NextResponse.json({ tag: result.data });
}, { route: "/api/tags/[id]" });

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const result = await Tags.remove(auth.userId, params.id);
  if (!result.ok) return resultResponse(result);
  return NextResponse.json({ success: true });
}, { route: "/api/tags/[id]" });
