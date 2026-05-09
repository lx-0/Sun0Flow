import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { Tags } from "@/lib/tags";

export const GET = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const result = await Tags.listForSong(auth.userId, params.id);
  if (!result.ok) return resultResponse(result);
  return NextResponse.json({ tags: result.data });
}, { route: "/api/songs/[id]/tags" });

export const POST = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  const result = await Tags.addToSong(auth.userId, params.id, {
    tagId: typeof body.tagId === "string" ? body.tagId : undefined,
    name: typeof body.name === "string" ? body.name : undefined,
  });
  if (!result.ok) return resultResponse(result);
  const { tag, created } = result.data;
  return NextResponse.json({ tag }, { status: created ? 201 : 200 });
}, { route: "/api/songs/[id]/tags" });
