import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/sanitize";
import { badRequest, notFound } from "@/lib/api-error";

const VALID_DIGEST_FREQUENCIES = ["daily", "weekly", "monthly", "off"] as const;
type DigestFrequency = (typeof VALID_DIGEST_FREQUENCIES)[number];

export const GET = authRoute(async (_request, { auth }) => {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      name: true,
      bio: true,
      avatarUrl: true,
      emailWelcome: true,
      emailGenerationComplete: true,
      emailDigestFrequency: true,
      quietHoursEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      accounts: { select: { provider: true, type: true } },
    },
  });

  if (!user) {
    return notFound("User not found");
  }

  const { accounts, ...rest } = user;
  return NextResponse.json({
    ...rest,
    connectedProviders: accounts.map((a: { provider: string; type: string }) => a.provider),
  });
}, { route: "/api/settings" });

export const PATCH = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const {
    name,
    bio,
    avatarUrl,
    emailWelcome,
    emailGenerationComplete,
    emailDigestFrequency,
    quietHoursEnabled,
    quietHoursStart,
    quietHoursEnd,
  } = body;

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

  if (emailWelcome !== undefined) {
    if (typeof emailWelcome !== "boolean") {
      return badRequest("emailWelcome must be a boolean");
    }
    data.emailWelcome = emailWelcome;
  }

  if (emailGenerationComplete !== undefined) {
    if (typeof emailGenerationComplete !== "boolean") {
      return badRequest("emailGenerationComplete must be a boolean");
    }
    data.emailGenerationComplete = emailGenerationComplete;
  }

  if (emailDigestFrequency !== undefined) {
    if (!VALID_DIGEST_FREQUENCIES.includes(emailDigestFrequency as DigestFrequency)) {
      return badRequest(`emailDigestFrequency must be one of: ${VALID_DIGEST_FREQUENCIES.join(", ")}`);
    }
    data.emailDigestFrequency = emailDigestFrequency;
  }

  if (quietHoursEnabled !== undefined) {
    if (typeof quietHoursEnabled !== "boolean") {
      return badRequest("quietHoursEnabled must be a boolean");
    }
    data.quietHoursEnabled = quietHoursEnabled;
  }

  if (quietHoursStart !== undefined) {
    if (typeof quietHoursStart !== "number" || quietHoursStart < 0 || quietHoursStart > 23) {
      return badRequest("quietHoursStart must be an integer 0–23");
    }
    data.quietHoursStart = quietHoursStart;
  }

  if (quietHoursEnd !== undefined) {
    if (typeof quietHoursEnd !== "number" || quietHoursEnd < 0 || quietHoursEnd > 23) {
      return badRequest("quietHoursEnd must be an integer 0–23");
    }
    data.quietHoursEnd = quietHoursEnd;
  }

  if (Object.keys(data).length === 0) {
    return badRequest("No fields to update");
  }

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      bio: true,
      avatarUrl: true,
      emailWelcome: true,
      emailGenerationComplete: true,
      emailDigestFrequency: true,
      quietHoursEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
    },
  });

  return NextResponse.json(user);
}, { route: "/api/settings" });
