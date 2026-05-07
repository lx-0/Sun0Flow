import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { executeBatch } from "@/lib/songs/batch";

export async function POST(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const body = await request.json();
  const result = await executeBatch(userId, body);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    action: result.action,
    affected: result.affected,
    songIds: result.songIds,
  });
}
