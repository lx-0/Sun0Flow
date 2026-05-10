import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const POST = authRoute(async (_request, { auth }) => {
  await prisma.user.update({
    where: { id: auth.userId },
    data: { onboardingCompleted: false },
  });

  return NextResponse.json({ success: true });
});
