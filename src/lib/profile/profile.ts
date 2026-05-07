import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/sanitize";
import { success, Err, type ProfileResult } from "./result";

const PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  bio: true,
  avatarUrl: true,
  username: true,
  bannerUrl: true,
  featuredSongId: true,
  defaultStyle: true,
  preferredGenres: true,
} as const;

const UPDATE_SELECT = {
  id: true,
  email: true,
  name: true,
  bio: true,
  avatarUrl: true,
  username: true,
  bannerUrl: true,
  featuredSongId: true,
} as const;

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PROFILE_SELECT,
  });

  if (!user) return Err.notFound("User not found");
  return success(user);
}

export interface ProfileUpdateInput {
  name?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  username?: string | null;
  bannerUrl?: string | null;
  featuredSongId?: string | null;
}

export async function updateProfile(
  userId: string,
  input: ProfileUpdateInput,
): Promise<ProfileResult<typeof UPDATE_SELECT extends infer S ? { [K in keyof S]: unknown } : never>> {
  const data: Record<string, unknown> = {};

  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      return Err.validation("Name is required");
    }
    if (input.name.length > 100) {
      return Err.validation("Name must be 100 characters or less");
    }
    data.name = stripHtml(input.name).trim();
  }

  if (input.bio !== undefined) {
    if (input.bio !== null && typeof input.bio !== "string") {
      return Err.validation("Bio must be a string");
    }
    if (typeof input.bio === "string" && input.bio.length > 500) {
      return Err.validation("Bio must be 500 characters or less");
    }
    data.bio = input.bio ? stripHtml(input.bio).trim() : null;
  }

  if (input.avatarUrl !== undefined) {
    const err = validateUrl(input.avatarUrl, "Avatar URL");
    if (err) return err;
    data.avatarUrl = input.avatarUrl ? input.avatarUrl.trim() : null;
  }

  if (input.username !== undefined) {
    const result = await validateUsername(input.username, userId);
    if (!result.ok) return result;
    data.username = result.data.username;
  }

  if (input.bannerUrl !== undefined) {
    const err = validateUrl(input.bannerUrl, "Banner URL");
    if (err) return err;
    data.bannerUrl = input.bannerUrl ? input.bannerUrl.trim() : null;
  }

  if (input.featuredSongId !== undefined) {
    if (input.featuredSongId !== null && typeof input.featuredSongId !== "string") {
      return Err.validation("Featured song ID must be a string");
    }
    if (input.featuredSongId) {
      const song = await prisma.song.findFirst({
        where: { id: input.featuredSongId, userId },
        select: { id: true },
      });
      if (!song) return Err.notFound("Song not found");
    }
    data.featuredSongId = input.featuredSongId ?? null;
  }

  if (Object.keys(data).length === 0) {
    return Err.validation("No fields to update");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: UPDATE_SELECT,
  });

  return success(user);
}

export interface DeleteAccountInput {
  password: string;
  confirmEmail: string;
}

export async function deleteAccount(
  userId: string,
  input: DeleteAccountInput,
) {
  if (!input.password || !input.confirmEmail) {
    return Err.validation("Password and email confirmation are required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });

  if (!user?.passwordHash) return Err.notFound("User not found");

  if (input.confirmEmail !== user.email) {
    return Err.validation("Email does not match your account");
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) return Err.validation("Password is incorrect");

  await prisma.user.delete({ where: { id: userId } });

  return success({ success: true as const });
}

function validateUrl(
  value: string | null | undefined,
  label: string,
): ProfileResult<never> | null {
  if (value !== null && value !== undefined && typeof value !== "string") {
    return Err.validation(`${label} must be a string`);
  }
  if (typeof value === "string" && value.length > 2048) {
    return Err.validation(`${label} too long`);
  }
  if (typeof value === "string" && value) {
    try {
      new URL(value);
    } catch {
      return Err.validation(`Invalid ${label.toLowerCase()}`);
    }
  }
  return null;
}

async function validateUsername(
  username: string | null | undefined,
  userId: string,
): Promise<ProfileResult<{ username: string | null }>> {
  if (username !== null && username !== undefined && typeof username !== "string") {
    return Err.validation("Username must be a string");
  }
  if (typeof username === "string") {
    const trimmed = username.trim().toLowerCase();
    if (trimmed.length > 30) {
      return Err.validation("Username must be 30 characters or less");
    }
    if (trimmed && !/^[a-z0-9_]+$/.test(trimmed)) {
      return Err.validation("Username may only contain letters, numbers, and underscores");
    }
    if (trimmed) {
      const existing = await prisma.user.findUnique({
        where: { username: trimmed },
        select: { id: true },
      });
      if (existing && existing.id !== userId) {
        return Err.conflict("Username is already taken");
      }
      return success({ username: trimmed });
    }
    return success({ username: null });
  }
  return success({ username: null });
}
