import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { Tags } from "@/lib/tags";

export const GET = authRoute(async (_request, { auth }) => {
  const tags = await Tags.list(auth.userId);
  return NextResponse.json({ tags });
}, { route: "/api/tags" });

export const POST = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const result = await Tags.create(
    auth.userId,
    typeof body.name === "string" ? body.name : "",
    typeof body.color === "string" ? body.color : undefined,
  );
  if (!result.ok) return resultResponse(result);
  const { tag, created } = result.data;
  return NextResponse.json({ tag }, { status: created ? 201 : 200 });
}, { route: "/api/tags" });
