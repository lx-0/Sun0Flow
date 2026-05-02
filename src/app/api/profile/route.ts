import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/sanitize";
import { badRequest, notFound } from "@/lib/api-error";

export const GET = authRoute(async (_request, { auth }) => {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true, name: true, bio: true, avatarUrl: true, username: true, bannerUrl: true, featuredSongId: true, defaultStyle: true, preferredGenres: true },
  });

  if (!user) {
    return notFound("User not found");
  }

  return NextResponse.json(user);
}, { route: "/api/profile" });

export const PATCH = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const { name, bio, avatarUrl, username, bannerUrl, featuredSongId } = body;

  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return badRequest("Name is required");
    }
    if (name.length > 100) {
      return badRequest("Name must be 100 characters or less");
    }
    data.name = stripHtml(name).trim();
  }

  if (bio !== undefined) {
    if (bio !== null && typeof bio !== "string") {
      return badRequest("Bio must be a string");
    }
    if (typeof bio === "string" && bio.length > 500) {
      return badRequest("Bio must be 500 characters or less");
    }
    data.bio = bio ? stripHtml(bio).trim() : null;
  }

  if (avatarUrl !== undefined) {
    if (avatarUrl !== null && typeof avatarUrl !== "string") {
      return badRequest("Avatar URL must be a string");
    }
    if (typeof avatarUrl === "string" && avatarUrl.length > 2048) {
      return badRequest("Avatar URL too long");
    }
    if (typeof avatarUrl === "string" && avatarUrl) {
      try {
        new URL(avatarUrl);
      } catch {
        return badRequest("Invalid avatar URL");
      }
    }
    data.avatarUrl = avatarUrl ? avatarUrl.trim() : null;
  }

  if (username !== undefined) {
    if (username !== null && typeof username !== "string") {
      return badRequest("Username must be a string");
    }
    if (typeof username === "string") {
      const trimmed = username.trim().toLowerCase();
      if (trimmed.length > 30) {
        return badRequest("Username must be 30 characters or less");
      }
      if (trimmed && !/^[a-z0-9_]+$/.test(trimmed)) {
        return badRequest("Username may only contain letters, numbers, and underscores");
      }
      if (trimmed) {
        const existing = await prisma.user.findUnique({
          where: { username: trimmed },
          select: { id: true },
        });
        if (existing && existing.id !== auth.userId) {
          return NextResponse.json({ error: "Username is already taken", code: "CONFLICT" }, { status: 409 });
        }
        data.username = trimmed;
      } else {
        data.username = null;
      }
    } else {
      data.username = null;
    }
  }

  if (bannerUrl !== undefined) {
    if (bannerUrl !== null && typeof bannerUrl !== "string") {
      return badRequest("Banner URL must be a string");
    }
    if (typeof bannerUrl === "string" && bannerUrl.length > 2048) {
      return badRequest("Banner URL too long");
    }
    if (typeof bannerUrl === "string" && bannerUrl) {
      try {
        new URL(bannerUrl);
      } catch {
        return badRequest("Invalid banner URL");
      }
    }
    data.bannerUrl = bannerUrl ? bannerUrl.trim() : null;
  }

  if (featuredSongId !== undefined) {
    if (featuredSongId !== null && typeof featuredSongId !== "string") {
      return badRequest("Featured song ID must be a string");
    }
    if (featuredSongId) {
      const song = await prisma.song.findFirst({
        where: { id: featuredSongId, userId: auth.userId },
        select: { id: true },
      });
      if (!song) {
        return notFound("Song not found");
      }
    }
    data.featuredSongId = featuredSongId ?? null;
  }

  if (Object.keys(data).length === 0) {
    return badRequest("No fields to update");
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: { id: true, email: true, name: true, bio: true, avatarUrl: true, username: true, bannerUrl: true, featuredSongId: true },
  });

  return NextResponse.json(user);
}, { route: "/api/profile" });

export const DELETE = authRoute(async (request, { auth }) => {
  const { password, confirmEmail } = await request.json();

  if (!password || !confirmEmail) {
    return badRequest("Password and email confirmation are required");
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true, passwordHash: true },
  });

  if (!user?.passwordHash) {
    return notFound("User not found");
  }

  if (confirmEmail !== user.email) {
    return badRequest("Email does not match your account");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return badRequest("Password is incorrect");
  }

  await prisma.user.delete({ where: { id: auth.userId } });

  return NextResponse.json({ success: true });
}, { route: "/api/profile" });
