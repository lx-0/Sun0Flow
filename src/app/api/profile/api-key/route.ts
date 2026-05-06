import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sunoApiKey: true, usePersonalApiKey: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Return masked key so the full key is never exposed to the client after saving
  const hasKey = Boolean(user.sunoApiKey);
  const maskedKey = user.sunoApiKey
    ? user.sunoApiKey.slice(0, 4) + "…" + user.sunoApiKey.slice(-4)
    : null;

  return NextResponse.json({ hasKey, maskedKey, usePersonalApiKey: user.usePersonalApiKey });
}

export async function PATCH(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

  const body = await request.json();
  const { sunoApiKey, usePersonalApiKey } = body;

  // Must provide at least one field
  if (sunoApiKey === undefined && usePersonalApiKey === undefined) {
    return NextResponse.json(
      { error: "Provide sunoApiKey or usePersonalApiKey", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const updateData: { sunoApiKey?: string | null; usePersonalApiKey?: boolean } = {};

  if (sunoApiKey !== undefined) {
    if (typeof sunoApiKey !== "string") {
      return NextResponse.json(
        { error: "sunoApiKey must be a string", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    updateData.sunoApiKey = sunoApiKey.trim() || null;
  }

  if (usePersonalApiKey !== undefined) {
    if (typeof usePersonalApiKey !== "boolean") {
      return NextResponse.json(
        { error: "usePersonalApiKey must be a boolean", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    updateData.usePersonalApiKey = usePersonalApiKey;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: { sunoApiKey: true, usePersonalApiKey: true },
  });

  const hasKey = Boolean(updated.sunoApiKey);
  const maskedKey = updated.sunoApiKey
    ? updated.sunoApiKey.slice(0, 4) + "…" + updated.sunoApiKey.slice(-4)
    : null;

  return NextResponse.json({ hasKey, maskedKey, usePersonalApiKey: updated.usePersonalApiKey });
}
