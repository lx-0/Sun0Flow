import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicRoute } from "@/lib/route-handler";
import { badRequest } from "@/lib/api-error";
import { createEmailVerifiedData } from "@/lib/auth/tokens";

const verifyEmailBody = z.object({
  token: z.string().trim().min(1, "Token is required"),
});

export const POST = publicRoute<Record<string, never>, z.infer<typeof verifyEmailBody>>(
  async (_request, { body }) => {
    const { token } = body;

    const user = await prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      return badRequest("Invalid verification token");
    }

    if (user.emailVerified) {
      return NextResponse.json({ message: "Email already verified" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: createEmailVerifiedData(),
    });

    return NextResponse.json({ message: "Email verified successfully" });
  },
  {
    body: verifyEmailBody,
    route: "/api/auth/verify-email",
  }
);
