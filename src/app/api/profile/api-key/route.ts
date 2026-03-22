import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sunoApiKey: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Return masked key so the full key is never exposed to the client after saving
  const hasKey = Boolean(user.sunoApiKey);
  const maskedKey = user.sunoApiKey
    ? user.sunoApiKey.slice(0, 4) + "…" + user.sunoApiKey.slice(-4)
    : null;

  return NextResponse.json({ hasKey, maskedKey });
}

export async function PATCH(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

  const { sunoApiKey } = await request.json();

  if (typeof sunoApiKey !== "string") {
    return NextResponse.json(
      { error: "sunoApiKey must be a string" },
      { status: 400 }
    );
  }

  // Empty string means "remove key"
  const keyValue = sunoApiKey.trim() || null;

  await prisma.user.update({
    where: { id: userId },
    data: { sunoApiKey: keyValue },
  });

  const hasKey = Boolean(keyValue);
  const maskedKey = keyValue
    ? keyValue.slice(0, 4) + "…" + keyValue.slice(-4)
    : null;

  return NextResponse.json({ hasKey, maskedKey });
}
