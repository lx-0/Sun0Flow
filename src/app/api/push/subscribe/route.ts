import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/push/subscribe — save or refresh a push subscription
export async function POST(request: NextRequest) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const body = await request.json();
  const { endpoint, keys } = body ?? {};

  if (
    typeof endpoint !== "string" ||
    !endpoint ||
    typeof keys?.p256dh !== "string" ||
    typeof keys?.auth !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid subscription object", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/push/subscribe — remove a push subscription
export async function DELETE(request: NextRequest) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const body = await request.json();
  const { endpoint } = body ?? {};

  if (typeof endpoint !== "string" || !endpoint) {
    return NextResponse.json(
      { error: "endpoint is required", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });

  return NextResponse.json({ ok: true });
}
