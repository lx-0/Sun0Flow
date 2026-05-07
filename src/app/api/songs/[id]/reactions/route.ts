import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authRoute } from "@/lib/route-handler";
import { listReactions, createReaction } from "@/lib/reactions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const after = searchParams.get("after");

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const result = await listReactions(id, userId, after);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data);
}

export const POST = authRoute<{ id: string }>(async (request, { auth: authCtx, params }) => {
  const body = await request.json();
  const result = await createReaction(params.id, authCtx.userId, body);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data, { status: 201 });
}, { route: "/api/songs/[id]/reactions" });
