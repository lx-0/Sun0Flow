import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { listComments, createComment } from "@/lib/comments";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  const result = await listComments(id, page);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data);
}

export const POST = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  const result = await createComment(params.id, auth.userId, body);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data, { status: 201 });
}, { route: "/api/songs/[id]/comments" });
