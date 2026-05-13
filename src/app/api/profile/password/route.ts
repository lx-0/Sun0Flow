import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authRoute } from "@/lib/route-handler";
import { badRequest, notFound } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  currentPassword: z.string().trim().min(1),
  newPassword: z.string().trim().min(1),
  confirmPassword: z.string().trim().min(1),
});

export const POST = authRoute<Record<string, never>, z.infer<typeof bodySchema>>(async (_request, { auth, body }) => {
  const { currentPassword, newPassword, confirmPassword } = body;

  if (newPassword.length < 8) {
    return badRequest("New password must be at least 8 characters");
  }

  if (newPassword !== confirmPassword) {
    return badRequest("Passwords do not match");
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { passwordHash: true },
  });

  if (!user?.passwordHash) {
    return notFound("User not found");
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return badRequest("Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: auth.userId },
    data: { passwordHash },
  });

  return NextResponse.json({ success: true });
}, {
  route: "/api/profile/password",
  body: bodySchema,
});
