import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { Tags } from "@/lib/tags";
import { z } from "zod";

const createTagBody = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
});

export const GET = authRoute(async (_request, { auth }) => {
  const tags = await Tags.list(auth.userId);
  return NextResponse.json({ tags });
}, { route: "/api/tags" });

export const POST = authRoute(async (_request, { auth, body }) => {
  const result = await Tags.create(
    auth.userId,
    body.name ?? "",
    body.color,
  );
  if (!result.ok) return resultResponse(result);
  const { tag, created } = result.data;
  return NextResponse.json({ tag }, { status: created ? 201 : 200 });
}, { route: "/api/tags", body: createTagBody });
