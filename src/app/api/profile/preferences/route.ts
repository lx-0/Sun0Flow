import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { getPreferences, updatePreferences } from "@/lib/profile";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const result = await getPreferences(userId);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data);
}

export async function PATCH(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const body = await request.json();
  const result = await updatePreferences(userId, body);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data);
}
