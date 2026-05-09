import { auth } from "@/lib/auth";
import { authRoute, resultResponse } from "@/lib/route-handler";
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

  return resultResponse(await listReactions(id, userId, after));
}

export const POST = authRoute<{ id: string }>(async (request, { auth: authCtx, params }) => {
  const body = await request.json();
  return resultResponse(await createReaction(params.id, authCtx.userId, body), { status: 201 });
}, { route: "/api/songs/[id]/reactions" });
