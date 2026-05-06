import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/account — soft-deletes the authenticated user's account
// Requires password and email confirmation. Cancels Stripe subscription if present.
export async function DELETE(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const { password, confirmEmail } = await request.json();

  if (!password || !confirmEmail) {
    return NextResponse.json(
      { error: "Password and email confirmation are required", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "Account deletion requires a password. Use your account provider to delete OAuth-only accounts.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  if (confirmEmail !== user.email) {
    return NextResponse.json(
      { error: "Email does not match your account", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Password is incorrect", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  // Cascade delete: songs, playlists, templates, accounts, sessions all cascade via schema
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}
