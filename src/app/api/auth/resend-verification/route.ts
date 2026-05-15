import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { authRoute } from "@/lib/route-handler";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/email";
import { notFound, rateLimited } from "@/lib/api-error";

export const POST = authRoute(async (_request, { auth }) => {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true, emailVerified: true },
  });

  if (!user || !user.email) {
    return notFound("User not found");
  }

  if (user.emailVerified) {
    return NextResponse.json({ message: "Email already verified" });
  }

  const { acquired } = await acquireRateLimitSlot(user.id, "verification_email");
  if (!acquired) {
    return rateLimited("Too many requests. Please try again later.");
  }

  const verificationToken = crypto.randomUUID();

  await prisma.user.update({
    where: { id: user.id },
    data: { verificationToken },
  });

  await sendVerificationEmail(user.email, verificationToken);

  return NextResponse.json({ message: "Verification email sent" });
});
