import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicRoute } from "@/lib/route-handler";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";
import { createPasswordResetTokenData } from "@/lib/auth/tokens";

const forgotPasswordBody = z.object({
  email: z.string().trim().min(1, "Email is required"),
});

export const POST = publicRoute<Record<string, never>, z.infer<typeof forgotPasswordBody>>(
  async (_request, { body }) => {
    const { email } = body;

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      message: "If an account with that email exists, a reset link has been sent.",
    });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return successResponse;
    }

    // Rate limit: max 3 reset emails per hour per user
    const { acquired } = await acquireRateLimitSlot(user.id, "password_reset");
    if (!acquired) {
      // Still return success to prevent enumeration
      return successResponse;
    }

    const resetTokenData = createPasswordResetTokenData();

    await prisma.user.update({
      where: { id: user.id },
      data: resetTokenData,
    });

    await sendPasswordResetEmail(email, resetTokenData.resetToken);

    return successResponse;
  },
  {
    body: forgotPasswordBody,
    route: "/api/auth/forgot-password",
  }
);
