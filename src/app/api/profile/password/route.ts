import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  currentPassword: z.string().trim().min(1),
  newPassword: z.string().trim().min(1),
  confirmPassword: z.string().trim().min(1),
});

async function parseBody(request: Request) {
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return { error: badRequest("All fields are required") } as const;
    return { data: parsed.data } as const;
  } catch {
    return { error: badRequest("Invalid JSON body") } as const;
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return unauthorized();
  }

  const parsedBody = await parseBody(request);
  if (parsedBody.error) {
    return parsedBody.error;
  }

  const { currentPassword, newPassword, confirmPassword } = parsedBody.data;

  if (newPassword.length < 8) {
    return badRequest("New password must be at least 8 characters");
  }

  if (newPassword !== confirmPassword) {
    return badRequest("Passwords do not match");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
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
    where: { id: session.user.id },
    data: { passwordHash },
  });

  return NextResponse.json({ success: true });
}
