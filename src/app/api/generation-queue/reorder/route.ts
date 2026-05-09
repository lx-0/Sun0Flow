import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { reorderItems } from "@/lib/generation-queue";

export async function POST(request: Request) {
  const { userId, error } = await resolveUser(request);
  if (error) return error;

  const { orderedIds } = await request.json();

  if (!Array.isArray(orderedIds)) {
    return NextResponse.json(
      { error: "orderedIds must be an array", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  await reorderItems(userId, orderedIds);
  return NextResponse.json({ success: true });
}
