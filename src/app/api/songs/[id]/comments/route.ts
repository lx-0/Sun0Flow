import { authRoute, resultResponse } from "@/lib/route-handler";
import { listComments, createComment } from "@/lib/comments";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  return resultResponse(await listComments(id, page));
}

export const POST = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  return resultResponse(await createComment(params.id, auth.userId, body), { status: 201 });
}, { route: "/api/songs/[id]/comments" });
