import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { cancelItem } from "@/lib/generation-queue";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await resolveUser(request);
  if (error) return error;

  const { id } = await params;
  const result = await cancelItem(userId, id);

  if (!result.ok) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
