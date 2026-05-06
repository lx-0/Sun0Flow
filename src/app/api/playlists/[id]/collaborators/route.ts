import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import {
  listCollaborators,
  inviteByUsername,
  createInviteLink,
} from "@/lib/playlists";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const result = await listCollaborators(id, userId);
    if (!result.ok)
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      );
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json().catch(() => ({}));
    const { username, role } = body as { username?: string; role?: string };

    const result = username
      ? await inviteByUsername(id, userId, username, role)
      : await createInviteLink(id, userId, role);
    if (!result.ok)
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      );
    return NextResponse.json(result.data, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
