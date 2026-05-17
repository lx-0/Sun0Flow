import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { Tags } from "@/lib/tags";

const postBodySchema = z.object({
  tagId: z.string().optional(),
  name: z.string().optional(),
});

export const GET = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const result = await Tags.listForSong(auth.userId, params.id);
  if (!result.ok) return resultResponse(result);
  return NextResponse.json({ tags: result.data });
}, { route: "/api/songs/[id]/tags" });

export const POST = authRoute<{ id: string }, z.infer<typeof postBodySchema>>(async (
  _request,
  { auth, params, body },
) => {
  const result = await Tags.addToSong(auth.userId, params.id, {
    tagId: body.tagId,
    name: body.name,
  });
  if (!result.ok) return resultResponse(result);
  const { tag, created } = result.data;
  return NextResponse.json({ tag }, { status: created ? 201 : 200 });
}, {
  route: "/api/songs/[id]/tags",
  body: postBodySchema,
});
