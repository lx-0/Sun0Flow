import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, bio: true, avatarUrl: true, defaultStyle: true, preferredGenres: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

  const body = await request.json();
  const { name, bio, avatarUrl } = body;

  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    data.name = name.trim();
  }

  if (bio !== undefined) {
    if (bio !== null && typeof bio !== "string") {
      return NextResponse.json({ error: "Bio must be a string" }, { status: 400 });
    }
    if (typeof bio === "string" && bio.length > 500) {
      return NextResponse.json({ error: "Bio must be 500 characters or less" }, { status: 400 });
    }
    data.bio = bio ? bio.trim() : null;
  }

  if (avatarUrl !== undefined) {
    if (avatarUrl !== null && typeof avatarUrl !== "string") {
      return NextResponse.json({ error: "Avatar URL must be a string" }, { status: 400 });
    }
    data.avatarUrl = avatarUrl ? avatarUrl.trim() : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, name: true, bio: true, avatarUrl: true },
  });

  return NextResponse.json(user);
}

export async function DELETE(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

  const { password, confirmEmail } = await request.json();

  if (!password || !confirmEmail) {
    return NextResponse.json(
      { error: "Password and email confirmation are required" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });

  if (!user?.passwordHash) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (confirmEmail !== user.email) {
    return NextResponse.json(
      { error: "Email does not match your account" },
      { status: 400 }
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Password is incorrect" },
      { status: 400 }
    );
  }

  // Cascade delete: songs, playlists, templates, accounts, sessions all cascade
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}
