import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const VALID_TYPES = ["generation_complete", "weekly_highlights"] as const;
type UnsubscribeType = (typeof VALID_TYPES)[number];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const type = searchParams.get("type") as UnsubscribeType | null;

  if (!token || !type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid unsubscribe link", code: "INVALID_LINK" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid or expired unsubscribe link", code: "NOT_FOUND" }, { status: 404 });
  }

  const updateData =
    type === "generation_complete"
      ? { emailGenerationComplete: false }
      : { emailDigestFrequency: "off" };

  await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });

  logger.info({ userId: user.id, type }, "email: user unsubscribed");

  // Redirect to a confirmation page (settings page with a message)
  return NextResponse.redirect(new URL("/settings?unsubscribed=1", request.url));
}
